import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markOrderAsPaid } from "@/lib/payment-state-machine";

export const dynamic = "force-dynamic";

/**
 * Payment Simulation Endpoint
 * Used for testing payment flows without real Bakong API
 * 
 * Enable with: PAYMENT_SIMULATION_MODE=true
 */
export async function POST(req: NextRequest) {
  // Check if simulation mode is enabled
  const isSimulation = process.env.PAYMENT_SIMULATION_MODE === "true";
  
  if (!isSimulation) {
    // In production, allow simulation for testing with special header
    const allowTest = req.headers.get("x-allow-test-payment") === "true";
    if (!allowTest) {
      return NextResponse.json(
        { 
          error: "Payment simulation disabled in production",
          hint: "Add header: x-allow-test-payment: true"
        },
        { status: 403 }
      );
    }
  }

  try {
    const body = await req.json();
    const { orderNumber, amount } = body;

    if (!orderNumber || !amount) {
      return NextResponse.json(
        { error: "Missing orderNumber or amount" },
        { status: 400 }
      );
    }

    // Find order
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        status: true,
        amountUsd: true,
        amountKhr: true,
        currency: true,
        paymentRef: true,
        metadata: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Check if already paid
    const paidStatuses = ["PAID", "PROCESSING", "QUEUED", "DELIVERING", "DELIVERED"];
    if (paidStatuses.includes(order.status)) {
      return NextResponse.json(
        { 
          success: true, 
          message: "Order already paid",
          currentStatus: order.status,
          idempotent: true
        },
        { status: 200 }
      );
    }

    // Simulate payment success
    const result = await markOrderAsPaid(order.id, {
      paymentRef: order.paymentRef || `SIM-${Date.now()}`,
      amount: order.currency === "KHR" ? order.amountKhr || amount : amount,
      currency: order.currency,
      transactionId: `SIM-${Date.now()}`,
      verifiedBy: "simulation",
    });

    if (result.success) {
      console.log(`[simulation] Payment simulated for order ${orderNumber}`);
      return NextResponse.json({
        success: true,
        orderId: order.id,
        orderNumber,
        newStatus: result.status,
        message: "Payment simulated successfully",
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Failed to mark order as paid",
        status: order.status,
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("[simulation] Error:", error);
    return NextResponse.json(
      { error: error.message || "Simulation failed" },
      { status: 500 }
    );
  }
}
