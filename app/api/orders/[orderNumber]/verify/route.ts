import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment } from "@/lib/payment";
import crypto from "crypto";

/**
 * POST /api/orders/[orderNumber]/verify
 * 
 * PAYMENT VERIFICATION WITH BAKONG API
 * Checks Bakong API and updates order if payment confirmed
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const normalizedOrderNumber = orderNumber.toUpperCase();

  // 1. Get current order state
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

  // 2. If order is already paid, return current state
  const isPaid = ["PAID", "QUEUED", "DELIVERING", "DELIVERED"].includes(order.status);
  if (isPaid) {
    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      isPaid: true,
      paidAt: order.paidAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      message: getStatusMessage(order.status),
    });
  }

  // 3. Order is PENDING - check Bakong API for payment
  if (order.status === "PENDING") {
    let md5Hash = order.metadata?.bakongMd5;
    
    // Calculate MD5 from QR if not in metadata
    if (!md5Hash && order.qrString) {
      md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
    }

    if (md5Hash) {
      console.log(`[Verify] Checking Bakong for order ${order.orderNumber}, MD5: ${md5Hash}`);
      
      try {
        const bakongResult = await checkBakongPayment(md5Hash);
        
        console.log(`[Verify] Bakong result:`, { paid: bakongResult.paid, status: bakongResult.status });
        
        if (bakongResult.paid && bakongResult.status === "PAID") {
          console.log(`[Verify] Payment confirmed! Updating order ${order.orderNumber} to PAID`);
          
          // Update order to PAID
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              paidAt: bakongResult.paidAt || new Date(),
              metadata: {
                ...order.metadata,
                paymentVerifiedBy: "verify_endpoint",
                paymentVerifiedAt: new Date().toISOString(),
                bakongTransactionId: bakongResult.transactionId,
              },
            },
          });
          
          console.log(`[Verify] Order ${order.orderNumber} updated to PAID`);
          
          return NextResponse.json({
            orderNumber: order.orderNumber,
            status: "PAID",
            deliveryStatus: order.deliveryStatus,
            isPaid: true,
            paidAt: bakongResult.paidAt?.toISOString() || new Date().toISOString(),
            deliveredAt: order.deliveredAt?.toISOString(),
            message: "Payment received! Preparing your top-up...",
            justPaid: true,
          });
        }
      } catch (err: any) {
        console.error(`[Verify] Bakong check error:`, err.message);
        // Continue - don't fail the request
      }
    }
  }

  // 4. Return current state (payment not yet confirmed)
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
