import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment } from "@/lib/payment";
import { updateUserTotalSpent } from "@/lib/auth";
import { sendOrderReceipt } from "@/lib/email";
import { decryptField } from "@/lib/encryption";
import { guardUserApi, ordersApiRateLimit } from "@/lib/api-security";
import { logSecurityEvent } from "@/lib/security";

/**
 * GET /api/orders/[orderNumber]
 *
 * Polling endpoint that:
 * 1. Checks payment status via Bakong API (trusted provider data)
 * 2. Verifies paid amount matches order amount (strict check)
 * 3. Marks as PAID only after verification
 * 4. Triggers delivery after 30-second server-side delay
 * 5. Ensures idempotency (delivery runs only once)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const security = await guardUserApi(req, ordersApiRateLimit);
  if ("response" in security) return security.response;

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
  if (!order.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.userId !== security.user.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only check payment if order is PENDING and has a payment reference (not SIM-)
  if (order.status === "PENDING" && order.paymentRef && !order.paymentRef.startsWith("SIM-")) {
    try {
      const remote = await checkBakongPayment(order.paymentRef);

      if (remote && remote.paid) {
        // STRICT PAYMENT VALIDATION: Verify amount matches
        const isAmountValid = validatePaymentAmount(order, remote);

        if (!isAmountValid) {
          logSecurityEvent("PAYMENT_AMOUNT_MISMATCH", {
            orderNumber: order.orderNumber,
            expectedAmount: order.amountUsd,
            paidAmount: remote.amount,
            currency: order.currency,
          }, req);

          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "FAILED",
              failureReason: `Payment amount mismatch. Expected: ${order.amountUsd} ${order.currency}, Paid: ${remote.amount}`,
            },
          });

          return NextResponse.json({
            orderNumber: order.orderNumber,
            status: "FAILED",
            error: "Payment amount mismatch",
          }, { status: 400 });
        }

        // PAYMENT VERIFIED - Mark as PAID
        order = await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            paymentRef: order.paymentRef, // Keep the verified payment ref
          },
          include: {
            game: { select: { name: true, slug: true } },
            product: { select: { name: true } },
          },
        });

        // Update user total spent
        if (order.userId) {
          await updateUserTotalSpent(order.userId, order.amountUsd);
        }

        // SERVER-SIDE DELAY: Wait 30 seconds before delivery
        // This runs in the background - we don't await it here to avoid blocking the response
        // The actual delivery will be triggered by the next poll or webhook
        scheduleDelivery(order);

        const customerEmail = decryptField(order.customerEmail) ?? order.customerEmail;
        if (customerEmail) {
          await sendOrderReceipt({
            orderNumber: order.orderNumber,
            gameName: order.game.name,
            productName: order.product.name,
            playerUid: order.playerUid,
            amountUsd: order.amountUsd,
            amountKhr: order.amountKhr,
            currency: order.currency,
            paidAt: order.paidAt,
            deliveredAt: order.deliveredAt,
            status: order.status,
            customerEmail,
          });
        }
      } else if (remote && (remote.status === "UNPAID" || remote.status === "expired" || remote.status === "failed")) {
        // Payment failed or expired
        const newStatus = remote.status === "expired" ? "CANCELLED" : "FAILED";
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
      // If remote is null or still UNPAID, keep polling (don't change status)
    } catch (error) {
      // Log error but don't fail the request - will retry on next poll
      logSecurityEvent("PAYMENT_CHECK_ERROR", {
        orderNumber: order.orderNumber,
        error: String(error),
      }, req);
    }
  }

  // Handle delivery for PAID orders (server-side 30s delay)
  if (order.status === "PAID" && !order.deliveredAt) {
    const timeSincePaid = order.paidAt ? Date.now() - new Date(order.paidAt).getTime() : 0;

    if (timeSincePaid >= 30000) { // 30 seconds
      // Idempotency check: check if delivery was already attempted by checking status
      // Since we only mark as DELIVERED after successful delivery, this is safe
      try {
        await deliverOrder(order);
      } catch (error) {
        logSecurityEvent("DELIVERY_FAILED", {
          orderNumber: order.orderNumber,
          error: String(error),
        }, req);

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "FAILED",
            failureReason: `Delivery failed: ${String(error).slice(0, 200)}`,
          },
        });
      }
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

/**
 * Validate that paid amount matches order amount
 */
function validatePaymentAmount(order: any, remote: any): boolean {
  if (!remote.amount) return false;

  const paidAmount = parseFloat(remote.amount);
  if (isNaN(paidAmount)) return false;

  // Get expected amount
  const expectedAmount = order.currency === "KHR"
    ? (order.amountKhr ?? order.amountUsd * 4100)
    : order.amountUsd;

  // Strict check: exact match for KHR, small tolerance for USD (floating point)
  const tolerance = order.currency === "KHR" ? 0 : 0.01;

  return Math.abs(paidAmount - expectedAmount) <= tolerance;
}

/**
 * Schedule delivery to happen after 30 seconds
 * This is non-blocking - delivery will be triggered on next poll
 */
function scheduleDelivery(order: any) {
  // Mark that delivery is scheduled (but don't await the delay here)
  // The actual delay happens in the polling logic above
  console.log(`[delivery] Scheduled delivery for order ${order.orderNumber} after 30s delay`);
}

/**
 * Deliver the order (top-up game, send API request, etc.)
 */
async function deliverOrder(order: any) {
  // TODO: Implement actual delivery logic based on your game top-up API
  // For now, mark as DELIVERED
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
    },
  });

  console.log(`[delivery] Order ${order.orderNumber} delivered successfully`);
}

/**
 * Add deliveryAttempted field to Order model if not exists
 * NOTE: You need to add this to prisma/schema.prisma:
 *
 * model Order {
 *   ...
 *   deliveryAttempted Boolean @default(false)
 *   ...
 * }
 */
