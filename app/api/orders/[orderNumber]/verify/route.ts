import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkPaymentStatus } from "@/lib/payment";

/**
 * POST /api/orders/[orderNumber]/verify
 * 
 * PRODUCTION-GRADE PAYMENT VERIFICATION (READ-ONLY)
 * 
 * Rules:
 * 1. This endpoint is strictly READ-ONLY.
 * 2. It never triggers markOrderPaid or state changes.
 * 3. Recovery is handled by Bakong Webhook (Primary) and Background Worker (Secondary).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const normalizedOrderNumber = orderNumber.toUpperCase();

  // 1. Get current order state (SOURCE OF TRUTH)
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
      qrString: true,
      paymentExpiresAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // 2. Return current state
  // Final states for UI purposes
  const isPaid = ["PAID", "QUEUED", "DELIVERING", "DELIVERED"].includes(order.status);
  
  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    isPaid,
    paidAt: order.paidAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    message: getStatusMessage(order.status),
  });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "PENDING": return "Waiting for payment...";
    case "PAID":
    case "QUEUED": return "Payment received! Preparing your top-up...";
    case "DELIVERING": return "Delivering credits to your account...";
    case "DELIVERED": return "Top-up successful! Check your game account.";
    case "EXPIRED": return "Payment window expired. Please try again.";
    case "FAILED":
    case "FAILED_FINAL": return "Delivery failed. Please contact support.";
    case "CANCELLED": return "Order cancelled.";
    default: return "Processing your order...";
  }
}
