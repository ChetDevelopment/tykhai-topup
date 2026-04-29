import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { checkBakongPayment } from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";

// In-memory webhook replay protection (for serverless, use Redis/KV in production)
const processedWebhooks = new Set<string>();

// Dynamic exchange rate - read from settings or use environment variable
async function getExchangeRate(): Promise<number> {
  try {
    const settings = await prisma.settings.findFirst();
    if (settings?.exchangeRate) {
      return settings.exchangeRate;
    }
  } catch {
    // Settings table might not exist, use fallback
  }
  // Fallback to env or default
  return parseFloat(process.env.EXCHANGE_RATE_KHR || "4100");
}

export async function POST(req: NextRequest) {
  // Check for suspicious requests
  if (isSuspiciousRequest(req)) {
    logSecurityEvent("SUSPICIOUS_WEBHOOK", { url: req.url }, req);
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
        logSecurityEvent("INVALID_WEBHOOK_SIGNATURE", { signature }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Get payment reference
    const paymentRef = sanitizeInput(body.md5 || body.md5hash || body.transaction_id || "");

    if (!paymentRef || paymentRef.length < 10) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    // REPLAY PROTECTION: Check if this webhook was already processed (in-memory)
    const payloadHash = hashSha256(rawBodyString);
    if (!payloadHash) {
      return NextResponse.json({ error: "Failed to hash payload" }, { status: 500 });
    }
    const hashString: string = payloadHash;
    if (processedWebhooks.has(hashString)) {
      logSecurityEvent("WEBHOOK_REPLAY_ATTEMPT", {
        paymentRef,
      }, req);
      return NextResponse.json({ ok: true, skipped: true, reason: "already_processed" });
    }

    // Convert to SHA256 for internal lookup
    const secureRef = hashSha256(paymentRef).slice(0, 64);

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { paymentRef: paymentRef },
          { paymentRef: secureRef },
        ],
      },
      include: { game: true, product: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Check payment status with Bakong
    const result = await checkBakongPayment(paymentRef);
    if (!result || !result.paid) {
      return NextResponse.json({ status: "UNPAID" });
    }

    // CRITICAL: Verify paid amount matches order amount
    if (result.amount) {
      const paidAmount = parseFloat(result.amount);

      // Use dynamic exchange rate
      const exchangeRate = await getExchangeRate();

      const expectedAmount = order.currency === "KHR"
        ? (order.amountKhr ?? order.amountUsd * exchangeRate)
        : order.amountUsd;

      // Strict amount checking - no tolerance for KHR (exact match)
      // Small tolerance for USD due to potential floating point issues
      const tolerance = order.currency === "KHR" ? 0 : 0.01;

      if (Math.abs(paidAmount - expectedAmount) > tolerance) {
        console.error(`[bakong-webhook] Amount mismatch! Paid: ${paidAmount}, Expected: ${expectedAmount}, Currency: ${order.currency}`);
        logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
          orderNumber: order.orderNumber,
          paidAmount,
          expectedAmount,
          currency: order.currency,
          exchangeRate,
        }, req);

        // Update order with failure reason
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            failureReason: `Payment amount mismatch: paid ${paidAmount} ${order.currency}, expected ${expectedAmount.toFixed(2)}`,
          },
        });

        return NextResponse.json(
          { error: "Payment amount mismatch", status: "FAILED" },
          { status: 400 }
        );
      }
    }

    // Log the webhook as processed (replay protection - in-memory)
    processedWebhooks.add(payloadHash);
    // Keep set size manageable (max 1000 entries)
    if (processedWebhooks.size > 1000) {
      const iterator = processedWebhooks.values();
      for (let i = 0; i < 500; i++) {
        const next = iterator.next();
        if (!next.done) {
          processedWebhooks.delete(next.value);
        }
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        paidAt: new Date(),
        deliveredAt: new Date(),
        paymentRef: secureRef,
      },
    });

    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }

    const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${order.orderNumber}">Open in admin</a>` : "";
    await notifyTelegram(
      `💰 <b>New paid order (Bakong)</b>\n` +
        `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
        `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
        `UID: <code>${escapeHtml(order.playerUid)}</code>\n` +
        `Amount: ${order.currency === "KHR"
          ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} KHR`
          : `$${order.amountUsd.toFixed(2)}`}${link}`
    );

    return NextResponse.json({ status: "PAID", orderNumber: order.orderNumber });
  } catch (err) {
    console.error("[bakong-webhook] error:", err);
    logSecurityEvent("WEBHOOK_ERROR", { error: String(err) }, req);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
