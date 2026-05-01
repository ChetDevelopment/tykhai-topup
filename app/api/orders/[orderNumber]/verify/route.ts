import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment, validatePaymentAmount, markOrderPaid } from "@/lib/payment";
import { logSecurityEvent } from "@/lib/security";

/**
 * POST /api/orders/[orderNumber]/verify
 * 
 * PAYMENT VERIFICATION + AUTO-COMPLETE
 * 
 * Primary path: Webhook marks payment as PAID
 * Fallback path: Polling detects payment and auto-completes
 * 
 * FLOW:
 * 1. Check current order status
 * 2. If already PAID/QUEUED/DELIVERED → return status (idempotent)
 * 3. If PENDING → check Bakong API
 * 4. If Bakong confirms payment → validate amount → mark PAID → enqueue delivery
 * 5. Return current status
 * 
 * This ensures payment auto-completes even if webhook never arrives.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const normalizedOrderNumber = orderNumber.toUpperCase();

  const order = await prisma.order.findUnique({
    where: { orderNumber: normalizedOrderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      deliveryStatus: true,
      paymentRef: true,
      amountUsd: true,
      amountKhr: true,
      currency: true,
      metadata: true,
      createdAt: true,
      paidAt: true,
      deliveredAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Already processed - return status immediately (idempotent)
  if (
    order.status === "PAID" ||
    order.status === "QUEUED" ||
    order.status === "DELIVERING" ||
    order.status === "DELIVERED"
  ) {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      isPaid: true,
      paidAt: order.paidAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
    });
  }

  // Terminal states
  if (order.status === "FAILED" || order.status === "CANCELLED" || order.status === "FAILED_FINAL") {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      isPaid: false,
    });
  }

  // PENDING - check Bakong API and auto-complete if paid
  if (order.status === "PENDING") {
    const md5Hash = (order as any).metadata?.bakongMd5;

    if (!md5Hash) {
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: "PENDING",
        isPaid: false,
        message: "No payment MD5 hash found",
      });
    }

    try {
      const bakongResult = await checkBakongPayment(md5Hash);

      if (bakongResult.paid) {
        // Validate payment amount
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
              source: "verify_polling",
            }, req);

            await prisma.order.update({
              where: { id: order.id },
              data: {
                status: "FAILED",
                failureReason: `Payment amount mismatch: ${validation.message}`,
              },
            });

            return NextResponse.json({
              orderNumber: order.orderNumber,
              status: "FAILED",
              isPaid: false,
              error: "Payment amount mismatch",
            }, { status: 400 });
          }
        }

        // Payment confirmed - auto-complete (mark PAID + enqueue delivery)
        const markResult = await markOrderPaid(order.id, {
          paymentRef: order.paymentRef || `POLL-${md5Hash.slice(0, 16)}`,
          amount: bakongResult.amount ? parseFloat(String(bakongResult.amount)) : order.amountUsd,
          currency: bakongResult.currency || order.currency,
          transactionId: bakongResult.transactionId,
          verifiedBy: "polling",
        });

        if (markResult.success) {
          return NextResponse.json({
            orderNumber: order.orderNumber,
            status: markResult.status,
            isPaid: true,
            message: "Payment verified via polling",
          });
        }

        // markOrderPaid returned non-success (might be race with webhook)
        return NextResponse.json({
          orderNumber: order.orderNumber,
          status: markResult.status,
          isPaid: markResult.status === "QUEUED" || markResult.status === "PAID",
          message: markResult.message,
        });
      }

      // Payment not yet confirmed
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: "PENDING",
        isPaid: false,
        message: "Payment not yet confirmed",
      });
    } catch (error) {
      // Bakong API error - return pending, let next poll retry
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: "PENDING",
        isPaid: false,
        message: "Bakong API check failed",
      });
    }
  }

  // Default fallback
  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    isPaid: false,
  });
}
