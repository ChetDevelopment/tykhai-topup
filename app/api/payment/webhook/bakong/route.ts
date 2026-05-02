import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import {
  checkBakongPayment,
  validatePaymentAmount,
  markOrderPaid,
} from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";
import { z } from "zod";

// Webhook replay protection
const recentWebhookCache = new Set<string>();
const MAX_CACHE_SIZE = 500;

const WebhookSchema = z.object({
  md5: z.string().optional(),
  md5hash: z.string().optional(),
  transaction_id: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  transactionId: z.string().optional(),
  acknowledgedDateMs: z.number().optional(),
  toAccountId: z.string().optional(),
  receiverBankAccount: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (isSuspiciousRequest(req)) {
    await logSecurityEvent("SUSPICIOUS_WEBHOOK", { url: req.url }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rawBodyString = JSON.stringify(body);

    console.log("[webhook] Received webhook:", { body: rawBodyString });

    const parseResult = WebhookSchema.safeParse(body);
    if (!parseResult.success) {
      await logSecurityEvent("INVALID_WEBHOOK_PAYLOAD", { errors: parseResult.error.errors }, req);
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const validatedBody = parseResult.data;

    const signature = req.headers.get("x-bakong-signature") || req.headers.get("x-signature");
    if (signature && process.env.BAKONG_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(rawBodyString, signature, process.env.BAKONG_WEBHOOK_SECRET);
      if (!isValid) {
        await logSecurityEvent("INVALID_WEBHOOK_SIGNATURE", { signature }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const md5Hash = sanitizeInput(validatedBody.md5 || validatedBody.md5hash || "");
    console.log("[webhook] Extracted MD5:", md5Hash);

    if (!md5Hash || md5Hash.length !== 32) {
      return NextResponse.json({ error: "Invalid MD5 hash" }, { status: 400 });
    }

    // Replay protection
    const payloadHash = hashSha256(rawBodyString);
    if (payloadHash && recentWebhookCache.has(payloadHash)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    const existingLog = await prisma.paymentLog.findFirst({
      where: {
        event: "WEBHOOK_PROCESSED",
        metadata: { path: ["payloadHash"], string_contains: payloadHash || "" },
      },
      select: { id: true },
    });

    if (existingLog) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    console.log("[webhook] Looking for order with MD5:", md5Hash);

    const order = await prisma.order.findFirst({
      where: {
        metadata: { path: ["bakongMd5"], string_contains: md5Hash },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
        paymentRef: true,
        playerUid: true,
        metadata: true,
      },
    });

    console.log("[webhook] Order found:", order ? {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentRef: order.paymentRef,
      md5InMetadata: (order as any).metadata?.bakongMd5,
    } : "NOT FOUND");

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // CRITICAL: Verify MD5 matches exactly
    const storedMd5 = (order as any).metadata?.bakongMd5;
    console.log("[webhook] MD5 Comparison:", {
      receivedMd5: md5Hash,
      storedMd5: storedMd5,
      match: md5Hash === storedMd5,
      receivedLength: md5Hash?.length,
      storedLength: storedMd5?.length,
    });

    if (storedMd5 && md5Hash !== storedMd5) {
      console.error("[webhook] MD5 MISMATCH!", { received: md5Hash, stored: storedMd5 });
      await logSecurityEvent("WEBHOOK_MD5_MISMATCH", {
        orderNumber: order.orderNumber,
        receivedMd5: md5Hash,
        storedMd5,
      }, req);
      return NextResponse.json({ error: "MD5 mismatch" }, { status: 400 });
    }

    if (order.status === "PAID" || order.status === "QUEUED" || order.status === "DELIVERING" || order.status === "DELIVERED") {
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    const bakongResult = await checkBakongPayment(md5Hash);

    if (!bakongResult || !bakongResult.paid) {
      return NextResponse.json({ status: "UNPAID" });
    }

    if (bakongResult.amount) {
      const paidAmount = parseFloat(String(bakongResult.amount));
      const validation = validatePaymentAmount(
        order.amountUsd,
        order.currency === "KHR" ? order.amountKhr : undefined,
        paidAmount,
        order.currency
      );

      if (!validation.valid) {
        await logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
          orderNumber: order.orderNumber,
          paidAmount,
          expectedAmount: order.currency === "KHR" ? order.amountKhr : order.amountUsd,
          currency: order.currency,
          message: validation.message,
        }, req);

        await prisma.order.update({
          where: { id: order.id },
          data: { status: "FAILED", failureReason: `Payment amount mismatch: ${validation.message}` },
        });

        return NextResponse.json({ error: "Amount mismatch", status: "FAILED" }, { status: 400 });
      }
    }

    if (validatedBody.toAccountId && validatedBody.toAccountId !== process.env.BAKONG_ACCOUNT) {
      await logSecurityEvent("WEBHOOK_MERCHANT_MISMATCH", {
        orderNumber: order.orderNumber,
        expectedAccount: process.env.BAKONG_ACCOUNT,
        receivedAccount: validatedBody.toAccountId,
      }, req);

      return NextResponse.json({ error: "Merchant account mismatch" }, { status: 400 });
    }

    const markResult = await markOrderPaid(order.id, {
      paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
      amount: bakongResult.amount ? parseFloat(String(bakongResult.amount)) : order.amountUsd,
      currency: bakongResult.currency || order.currency,
      transactionId: bakongResult.transactionId,
      verifiedBy: "webhook",
    });

    if (!markResult.success && markResult.status !== "QUEUED") {
      return NextResponse.json({ status: markResult.status, message: markResult.message }, { status: 400 });
    }

    if (payloadHash) {
      recentWebhookCache.add(payloadHash);
      if (recentWebhookCache.size > MAX_CACHE_SIZE) {
        const iterator = recentWebhookCache.values();
        for (let i = 0; i < MAX_CACHE_SIZE / 2; i++) {
          const next = iterator.next();
          if (!next.done) recentWebhookCache.delete(next.value);
        }
      }
    }

    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        paymentRef: order.paymentRef,
        event: "WEBHOOK_PROCESSED",
        status: "SUCCESS",
        amount: bakongResult.amount ? parseFloat(String(bakongResult.amount)) : undefined,
        currency: bakongResult.currency || order.currency,
        metadata: JSON.stringify({ payloadHash, timestamp: new Date().toISOString() }),
      },
    });

    notifyTelegramPayment(order).catch(() => {});

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      deliveryStatus: "QUEUED",
    });
  } catch (err) {
    await logSecurityEvent("WEBHOOK_ERROR", { error: String(err) }, req);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function notifyTelegramPayment(order: any) {
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { game: true, product: true },
  });

  if (!fullOrder) return;

  const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${fullOrder.orderNumber}">Open in admin</a>` : "";

  await notifyTelegram(
    `💰 <b>New paid order (Bakong Webhook)</b>\n` +
      `<b>#${escapeHtml(fullOrder.orderNumber)}</b>\n` +
      `${escapeHtml(fullOrder.game.name)} — ${escapeHtml(fullOrder.product.name)}\n` +
      `UID: <code>${escapeHtml(fullOrder.playerUid)}</code>\n` +
      `Amount: ${fullOrder.currency === "KHR" ? `${Math.round(fullOrder.amountKhr ?? 0).toLocaleString()} ៛` : `$${fullOrder.amountUsd.toFixed(2)}`}${link}`
  );
}
