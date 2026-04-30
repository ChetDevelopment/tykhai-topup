import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment, validatePaymentAmount, processSuccessfulPayment } from "@/lib/payment";
import { sendOrderReceipt } from "@/lib/email";
import { decryptField } from "@/lib/encryption";
import { guardUserApi, ordersApiRateLimit } from "@/lib/api-security";
import { logSecurityEvent } from "@/lib/security";
import { canTransition } from "@/lib/payment-types";

/**
 * GET /api/orders/[orderNumber]
 * Polling endpoint:
 * 1. Checks payment status via Bakong API
 * 2. Verifies paid amount matches order amount
 * 3. Processes successful payments (marks as PROCESSING then DELIVERED)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  let order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, slug: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Only process if PENDING and has a payment reference
  if (order.status === "PENDING" && order.paymentRef && !order.paymentRef.startsWith("SIM-")) {
    try {
      const remote = await checkBakongPayment(order.paymentRef);

      if (remote && remote.paid) {
        // STRICT PAYMENT VALIDATION
        const orderAmountKhrForValidation = order.currency === "KHR" ? (order.amountKhr ?? undefined) : undefined;
        const { valid, expected, paid: paidAmount, currency } = validatePaymentAmount(
          order.amountUsd,
          order.currency,
          remote.amount ? parseFloat(remote.amount) : 0,
          orderAmountKhrForValidation
        );

        if (!valid) {
          await logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
            orderNumber: order.orderNumber,
            expectedAmount: expected,
            paidAmount,
            currency,
          }, req);

          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "FAILED",
              failureReason: `Payment amount mismatch. Expected: ${expected} ${currency}, Paid: ${paidAmount}`,
            },
          });

          return NextResponse.json({
            orderNumber: order.orderNumber,
            status: "FAILED",
            error: "Payment amount mismatch",
          }, { status: 400 });
        }

        // PAYMENT VERIFIED - Process delivery
        if (canTransition(order.status as any, "DELIVERED")) {
          order = await processSuccessfulPayment(order.id, {
            paymentRef: order.paymentRef,
            amount: remote.amount ? parseFloat(remote.amount) : order.amountUsd,
            currency: remote.currency || order.currency,
            transactionId: remote.transactionId,
          });
        }
      } else if (remote && (remote.status === "UNPAID" || remote.status === "expired" || remote.status === "failed")) {
        // Payment failed or expired
        const newStatus = remote.status === "expired" ? "CANCELLED" : "FAILED";
        if (canTransition(order.status as any, newStatus as any)) {
          order = await prisma.order.update({
            where: { id: order.id },
            data: {
              status: newStatus,
              failureReason: `Payment ${remote.status}`,
            },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });
        }
      }
      // If remote is null or still UNPAID, keep polling
    } catch (error) {
      await logSecurityEvent("PAYMENT_CHECK_ERROR", {
        orderNumber: order.orderNumber,
        error: String(error),
      }, req);
    }
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    gameName: order.game.name,
    gameSlug: order.game.slug,
    productName: order.product.name,
    playerUid: order.playerUid,
    serverId: order.serverId,
    amountUsd: order.amountUsd,
    amountKhr: order.amountKhr,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentRef: order.paymentRef,
    paymentUrl: order.paymentUrl,
    qrString: order.qrString,
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  });
}
