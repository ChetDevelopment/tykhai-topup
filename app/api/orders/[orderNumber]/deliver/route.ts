import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { executeDelivery } from "@/lib/payment";
import { logSecurityEvent } from "@/lib/security";

/**
 * POST /api/orders/[orderNumber]/deliver
 * 
 * PURPOSE: Product delivery ONLY
 * - Executes delivery via GameDrop/G2Bulk
 * - Handles retries with exponential backoff
 * - Idempotent: safe to call multiple times
 * 
 * STATE TRANSITION: PAID → PROCESSING → DELIVERED
 *                                    → DELIVERY_FAILED (after max retries)
 * 
 * GUARDS:
 * - Only runs if status = PAID or PROCESSING
 * - Skips if deliveryStatus = DELIVERED
 * - Stops after maxDeliveryAttempts
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
      deliveryAttempts: true,
      maxDeliveryAttempts: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Already delivered - idempotent
  if (order.deliveryStatus === "DELIVERED" || order.status === "DELIVERED") {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: "DELIVERED",
      message: "Already delivered",
    });
  }

  // Max attempts exceeded
  if (order.deliveryAttempts >= order.maxDeliveryAttempts) {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: "DELIVERY_FAILED",
      message: "Max delivery attempts exceeded",
    }, { status: 400 });
  }

  // Not ready for delivery
  if (order.status !== "PAID" && order.status !== "PROCESSING") {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      message: `Order not ready for delivery (status: ${order.status})`,
    }, { status: 400 });
  }

  try {
    const result = await executeDelivery(order.id);

    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: result.status,
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    await logSecurityEvent("DELIVERY_ERROR", {
      orderNumber: order.orderNumber,
      error: String(error),
    }, req);

    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: "PROCESSING",
      error: "Delivery error",
    }, { status: 500 });
  }
}
