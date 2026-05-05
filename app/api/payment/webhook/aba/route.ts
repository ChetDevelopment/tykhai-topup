import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkABAPayment, verifyABAWebhookSignature } from "@/lib/aba-payway";
import { processDeliveryQueue } from "@/lib/payment";
import { markOrderAsPaid } from "@/lib/payment-state-machine";

/**
 * POST /api/payment/webhook/aba
 * 
 * ABA PayWay Webhook Handler
 * ABA sends payment notifications here
 */
export async function POST(req: NextRequest) {
  console.log("[ABA Webhook] Received webhook");

  try {
    const body = await req.json();
    const rawBody = JSON.stringify(body);

    console.log("[ABA Webhook] Body:", body);

    // Verify webhook signature (if provided)
    const signature = req.headers.get("x-aba-signature");
    if (signature) {
      const isValid = verifyABAWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.error("[ABA Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Extract payment info from ABA webhook
    const {
      reference_id,
      transaction_id,
      status,
      amount,
      currency,
      paid_at,
    } = body;

    if (!reference_id) {
      return NextResponse.json({ error: "Missing reference_id" }, { status: 400 });
    }

    console.log("[ABA Webhook] Reference:", reference_id, "Status:", status);

    // Find order by ABA payment reference
    const order = await prisma.order.findFirst({
      where: {
        paymentRef: reference_id,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
      },
    });

    if (!order) {
      console.log("[ABA Webhook] Order not found for reference:", reference_id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    console.log("[ABA Webhook] Order found:", order.orderNumber);

    // Check if already paid (idempotency)
    if (["PAID", "PROCESSING", "DELIVERED"].includes(order.status)) {
      console.log("[ABA Webhook] Order already paid:", order.status);
      return NextResponse.json({ ok: true, skipped: true, reason: `already_${order.status}` });
    }

    // Verify payment status
    const isPaid = status === "success" || status === "paid" || status === "completed";

    if (!isPaid) {
      console.log("[ABA Webhook] Payment not confirmed:", status);
      return NextResponse.json({ status: "PENDING", message: "Payment not yet confirmed" });
    }

    // Mark order as paid
    const markResult = await markOrderAsPaid(order.id, {
      paymentRef: reference_id,
      amount: order.currency === "KHR" ? (order.amountKhr || 0) : order.amountUsd,
      currency: order.currency,
      transactionId: transaction_id || reference_id,
      verifiedBy: "aba_webhook",
    });

    if (!markResult.success) {
      console.error("[ABA Webhook] Failed to mark order as paid:", markResult.error);
      return NextResponse.json({ error: "Failed to update order" }, { status: 400 });
    }

    console.log("[ABA Webhook] Order marked as PAID:", order.orderNumber);

    // Trigger delivery
    processDeliveryQueue(5).then((result) => {
      console.log("[ABA Webhook] Delivery processing:", result);
    }).catch((err) => {
      console.error("[ABA Webhook] Delivery error:", err);
    });

    return NextResponse.json({
      status: "PAID",
      orderNumber: order.orderNumber,
      message: "Payment confirmed. Processing delivery.",
    });

  } catch (err: any) {
    console.error("[ABA Webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/payment/webhook/aba
 * 
 * ABA might send GET requests for verification
 */
export async function GET(req: NextRequest) {
  console.log("[ABA Webhook] GET request");
  return NextResponse.json({ ok: true, message: "ABA webhook endpoint active" });
}
