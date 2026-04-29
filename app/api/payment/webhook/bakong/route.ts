import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { checkBakongPayment } from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInput, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { hashSha256, verifyWebhookSignature } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  // Check for suspicious requests
  if (isSuspiciousRequest(req)) {
    logSecurityEvent("SUSPICIOUS_WEBHOOK", { url: req.url }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const rawBody = JSON.stringify(body);
    
    // Verify webhook signature if provided
    const signature = req.headers.get("x-bakong-signature") || req.headers.get("x-signature");
    if (signature && process.env.BAKONG_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(rawBody, signature, process.env.BAKONG_WEBHOOK_SECRET);
      if (!isValid) {
        logSecurityEvent("INVALID_WEBHOOK_SIGNATURE", { signature }, req);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
    
    // Get payment reference (use SHA256 internally instead of MD5)
    const paymentRef = sanitizeInput(body.md5 || body.md5hash || body.transaction_id || "");
    
    if (!paymentRef || paymentRef.length < 10) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    // Convert to SHA256 for internal lookup (more secure than MD5)
    const secureRef = hashSha256(paymentRef).slice(0, 64);
    
    const order = await prisma.order.findFirst({
      where: { 
        OR: [
          { paymentRef: paymentRef },
          { paymentRef: secureRef }
        ]
      },
      include: { game: true, product: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await checkBakongPayment(paymentRef);
    if (!result || !result.paid) {
      return NextResponse.json({ status: "UNPAID" });
    }

    // CRITICAL: Verify paid amount matches order amount
    if (result.amount) {
      const paidAmount = parseFloat(result.amount);
      const expectedAmount = order.currency === "KHR"
        ? (order.amountKhr ?? order.amountUsd * 4100)
        : order.amountUsd;

      // Allow 1% tolerance for currency conversion differences
      const tolerance = expectedAmount * 0.01;
      if (Math.abs(paidAmount - expectedAmount) > tolerance) {
        console.error(`[bakong-webhook] Amount mismatch! Paid: ${paidAmount}, Expected: ${expectedAmount}`);
        logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
          orderNumber: order.orderNumber,
          paidAmount,
          expectedAmount,
          currency: order.currency,
        }, req);

        // Update order with failure reason
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            failureReason: `Payment amount mismatch: paid ${paidAmount} ${order.currency}, expected ${expectedAmount}`,
          },
        });

        return NextResponse.json(
          { error: "Payment amount mismatch", status: "FAILED" },
          { status: 400 }
        );
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        paidAt: new Date(),
        deliveredAt: new Date(),
        paymentRef: secureRef, // Store SHA256 version instead of MD5
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
