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
 * READ-ONLY endpoint: Returns order status only
 * Payment processing moved to POST /api/orders/[orderNumber]/verify
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, slug: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
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

/**
 * POST /api/orders/[orderNumber]
 * Handles payment verification and processing (state-changing, not GET)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const order = await prisma.order.findUnique({
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
        // STRICT PAYMENT VALIDATION - Fix KHR validation bug
        const orderAmountKhrForValidation = order.currency === "KHR" ? order.amountKhr : undefined;
        const { valid, expected, paid: paidAmount, currency } = validatePaymentAmount(
          order.amountUsd,
          order.currency,
          remote.amount ? parseFloat(String(remote.amount)) : 0,
          orderAmountKhrForValidation ?? undefined
        );

        if (!valid) {
          await logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
            orderNumber: order.orderNumber,
            expectedAmount: expected,
            paidAmount,
            currency,
          }, req);

          await prisma.order.updateMany({
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

        // PAYMENT VERIFIED - Process delivery (atomic)
        const result = await processSuccessfulPayment(order.id, {
          paymentRef: order.paymentRef,
          amount: remote.amount ? parseFloat(String(remote.amount)) : order.amountUsd,
          currency: remote.currency || order.currency,
          transactionId: remote.transactionId,
        });

        return NextResponse.json({
          orderNumber: order.orderNumber,
          status: result?.status || "PROCESSING",
          message: "Payment verified and processed",
        });
      } else if (remote && (String(remote.status) === "UNPAID" || String(remote.status) === "expired" || String(remote.status) === "failed")) {
        const newStatus = String(remote.status) === "expired" ? "CANCELLED" : "FAILED";
        await prisma.order.updateMany({
          where: { id: order.id },
          data: {
            status: newStatus,
            failureReason: `Payment ${remote.status}`,
          },
        });

        return NextResponse.json({
          orderNumber: order.orderNumber,
          status: newStatus,
        });
      }
    } catch (error) {
      await logSecurityEvent("PAYMENT_CHECK_ERROR", {
        orderNumber: order?.orderNumber || "unknown",
        error: String(error),
      }, req);
    }
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
  });
}
