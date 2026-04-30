import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import {
  checkBakongPayment,
  validatePaymentAmount,
  processSuccessfulPayment,
} from "@/lib/payment";
import { PaymentError } from "@/lib/payment-types";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";
import { canTransition } from "@/lib/payment-types";

// In-memory webhook replay protection (for serverless, use Redis/KV in production)
const processedWebhooks = new Set<string>();

// Dynamic exchange rate
async function getExchangeRate(): Promise<number> {
  try {
    const settings = await prisma.settings.findFirst();
    if (settings?.exchangeRate) {
      return settings.exchangeRate;
    }
  } catch {
    // Settings table might not exist, use fallback
  }
  return parseFloat(process.env.EXCHANGE_RATE_KHR || "4100");
}

export async function POST(req: NextRequest) {
  // Check for suspicious requests
  if (isSuspiciousRequest(req)) {
    await logSecurityEvent("SUSPICIOUS_WEBHOOK", { url: req.url }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rawBodyString = JSON.stringify(body);

    // Verify webhook signature if provided
    const signature = req.headers.get("x-bakong-signature") || req.headers.get("x-signature");
    if (signature && process.env.BAKONG_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(rawBodyString, signature, process.env.BAKONG_WEBHOOK_SECRET);
      if (!isValid) {
        await logSecurityEvent("INVALID_WEBHOOK_SIGNATURE", { signature }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Get payment reference
    const paymentRef = sanitizeInput(body.md5 || body.md5hash || body.transaction_id || "");
    if (!paymentRef || paymentRef.length < 10) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    // REPLAY PROTECTION
    const payloadHash = hashSha256(rawBodyString);
    if (!payloadHash) {
      return NextResponse.json({ error: "Failed to hash payload" }, { status: 500 });
    }

    if (processedWebhooks.has(payloadHash)) {
      await logSecurityEvent("WEBHOOK_REPLAY_ATTEMPT", { paymentRef }, req);
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    // Convert to SHA256 for internal lookup
    const secureRef = hashSha256(paymentRef).slice(0, 64);

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ paymentRef }, { paymentRef: secureRef }],
      },
      include: { game: true, product: true, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!canTransition(order.status as any, "DELIVERED")) {
      return NextResponse.json({ ok: true, skipped: true, reason: `status_already_${order.status}` });
    }

    // Check payment status with Bakong
    const result = await checkBakongPayment(paymentRef);
    if (!result || !result.paid) {
      return NextResponse.json({ status: "UNPAID" });
    }

    // CRITICAL: Verify paid amount matches order amount
    if (result.amount) {
      const paidAmount = parseFloat(String(result.amount));
      const exchangeRate = await getExchangeRate();

      const { valid, expected } = validatePaymentAmount(
        order.amountUsd,
        order.currency,
        paidAmount,
        order.currency === "KHR" ? undefined : exchangeRate
      );

      if (!valid) {
        await logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
          orderNumber: order.orderNumber,
          paidAmount,
          expectedAmount: expected,
          currency: order.currency,
          exchangeRate,
        }, req);

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            failureReason: `Payment amount mismatch: paid ${paidAmount} ${order.currency}, expected ${expected.toFixed(2)}`,
          },
        });

        return NextResponse.json(
          { error: "Payment amount mismatch", status: "FAILED" },
          { status: 400 }
        );
      }
    }

    // Log the webhook as processed (replay protection)
    processedWebhooks.add(payloadHash);
    // Keep set size manageable
    if (processedWebhooks.size > 1000) {
      const iterator = processedWebhooks.values();
      for (let i = 0; i < 500; i++) {
        const next = iterator.next();
        if (!next.done) {
          processedWebhooks.delete(next.value);
        }
      }
    }

    // Process the successful payment
    await processSuccessfulPayment(order.id, {
      paymentRef: secureRef,
      amount: result.amount ? parseFloat(String(result.amount)) : order.amountUsd,
      currency: result.currency || order.currency,
      transactionId: result.transactionId,
    });

    // Notify via Telegram
    const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${order.orderNumber}">Open in admin</a>` : "";
    await notifyTelegram(
      `💰 <b>New paid order (Bakong Webhook)</b>\n` +
        `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
        `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
        `UID: <code>${escapeHtml(order.playerUid)}</code>\n` +
        `Amount: ${order.currency === "KHR" ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} ៛` : `$${order.amountUsd.toFixed(2)}`}${link}`
    );

    return NextResponse.json({ status: "PAID", orderNumber: order.orderNumber });
  } catch (err) {
    console.error("[bakong-webhook] error:", err);
    await logSecurityEvent("WEBHOOK_ERROR", { error: String(err) }, req);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
