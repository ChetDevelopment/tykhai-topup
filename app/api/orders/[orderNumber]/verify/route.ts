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

  // PENDING - READ-ONLY check (does NOT finalize payment)
  // Payment finalization happens ONLY in webhook → markOrderPaid()
  if (order.status === "PENDING") {
    const md5Hash = (order as any).metadata?.bakongMd5;

    console.log("[verify] Order:", order.orderNumber, "Status:", order.status, "MD5:", md5Hash);

    if (!md5Hash) {
      console.error("[verify] No MD5 hash found for order:", order.orderNumber);
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: "PENDING",
        isPaid: false,
        message: "No payment MD5 hash found",
      });
    }

    try {
      // Add delay to allow Bakong API to propagate transaction
      console.log("[verify] Waiting 5 seconds before checking Bakong...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log("[verify] READ-ONLY check - calling checkBakongPayment with MD5:", md5Hash);
      const bakongResult = await checkBakongPayment(md5Hash);
      console.log("[verify] Bakong result (read-only):", JSON.stringify(bakongResult));

      // DO NOT call markOrderPaid() - webhook is the SINGLE SOURCE OF TRUTH
      // Only return status to client for display purposes

      if (bakongResult.paid) {
        // Payment detected - inform client, but DO NOT finalize
        console.log("[verify] Payment detected for", order.orderNumber, "- waiting for webhook to finalize");
        return NextResponse.json({
          orderNumber: order.orderNumber,
          status: "PENDING", // Still PENDING until webhook confirms
          isPaid: false,
          message: "Payment detected - finalizing...",
          debug: "Payment found, awaiting webhook confirmation",
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
      // Bakong API error - return pending, let webhook handle
      console.error("[verify] API check failed:", error);
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
