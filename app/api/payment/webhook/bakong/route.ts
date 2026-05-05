import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import {
  checkBakongPayment,
  validatePaymentAmount,
  processDeliveryQueue,
} from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";
import { z } from "zod";
import { markOrderAsPaid } from "@/lib/payment-state-machine";

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

    console.log("[webhook] ======= WEBHOOK RECEIVED =======");
    console.log("[webhook] Body:", rawBodyString);
    console.log("[webhook] Headers:", Object.fromEntries(req.headers.entries()));

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
      console.log("[webhook] Order not found for MD5:", md5Hash);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const storedMd5 = (order as any).metadata?.bakongMd5;
    console.log("[webhook] MD5 Comparison:", {
      receivedMd5: md5Hash,
      storedMd5: storedMd5,
      match: md5Hash === storedMd5,
    });

    if (storedMd5 && md5Hash !== storedMd5) {
      console.error(`[webhook] CRITICAL: MD5 MISMATCH for order ${order.orderNumber}! Received: ${md5Hash}, Stored: ${storedMd5}`);
      await logSecurityEvent("WEBHOOK_MD5_MISMATCH", {
        orderNumber: order.orderNumber,
        receivedMd5: md5Hash,
        storedMd5,
      }, req);
      return NextResponse.json({ error: "MD5 mismatch" }, { status: 400 });
    }

    // Check if already paid (idempotency)
    if (["PAID", "PROCESSING", "DELIVERED"].includes(order.status)) {
      console.log("[webhook] Order already paid:", order.status);
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    // Verify payment with Bakong API
    const bakongResult = await checkBakongPayment(md5Hash);
    
    if (!bakongResult.paid || (bakongResult.status as any) !== "PAID") {
      console.log("[webhook] Payment not confirmed:", bakongResult);
      return NextResponse.json({
        status: "PENDING",
        message: "Payment not yet confirmed",
      }, { status: 200 });
    }

    // Payment confirmed - mark order as paid using state machine
    const markResult = await markOrderAsPaid(order.id, {
      paymentRef: order.paymentRef || `WEBHOOK-${md5Hash.slice(0, 16)}`,
      amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
      currency: order.currency,
      transactionId: validatedBody.transactionId || validatedBody.transaction_id || md5Hash,
      verifiedBy: "webhook",
    });

    if (!markResult.success) {
      console.error("[webhook] Failed to mark order as paid:", markResult.error);
      return NextResponse.json({ 
        status: "ERROR", 
        message: markResult.error 
      }, { status: 400 });
    }

    console.log("[webhook] Order marked as PAID:", order.orderNumber);

    // Notify Telegram
    notifyTelegramPayment(order).catch(() => {});

    // Process delivery immediately (Vercel serverless - no background workers)
    console.log("[webhook] Triggering delivery processing...");
    processDeliveryQueue(5).then((result) => {
      console.log("[webhook] Delivery processing completed:", result);
    }).catch((err) => {
      console.error("[webhook] Delivery processing error:", err);
    });

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      deliveryStatus: "QUEUED",
      message: "Payment confirmed. Processing delivery.",
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
