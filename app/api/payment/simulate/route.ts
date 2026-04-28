import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { updateUserTotalSpent } from "@/lib/auth";

async function simulatePayment(req: NextRequest) {
  // Completely disable in production
  if (process.env.NODE_ENV === "production") {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Also check if explicitly disabled
  if (process.env.ENABLE_PAYMENT_SIMULATION !== "true") {
    return NextResponse.json(
      { error: "Payment simulation is disabled" },
      { status: 403 }
    );
  }

  const orderNumber = req.nextUrl.searchParams.get("order");
  const ref = req.nextUrl.searchParams.get("ref");

  if (!orderNumber) {
    return NextResponse.json({ error: "Missing order" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.status === "PENDING") {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paymentRef: ref ?? order.paymentRef,
        paidAt: new Date(),
      },
    });

    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }

    setTimeout(async () => {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
    }, 100);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const html = `<!doctype html>
<html>
<head>
<title>Payment Simulated - Ty Khai TopUp</title>
<meta http-equiv="refresh" content="3;url=${baseUrl}/order?number=${orderNumber}">
<style>
  body { font-family: system-ui; background: #0A0A0F; color: #F5F5F7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .box { text-align: center; padding: 2rem; border: 1px solid #24243A; border-radius: 16px; background: #12121A; max-width: 400px; }
  h1 { color: #FF6B1A; margin: 0 0 1rem; }
  .check { font-size: 3rem; margin-bottom: 1rem; }
  code { background: #24243A; padding: 2px 8px; border-radius: 4px; color: #FFB800; }
  a { color: #FF6B1A; }
</style>
</head>
<body>
  <div class="box">
    <div class="check">OK</div>
    <h1>Payment Simulated</h1>
    <p>Order <code>${orderNumber}</code> is being processed.</p>
    <p style="color:#8B8B9E;font-size:0.875rem">Simulation mode is active. In production this endpoint is disabled.</p>
    <p>Redirecting to order tracker in 3s...</p>
    <p><a href="${baseUrl}/order?number=${orderNumber}">Continue now</a></p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function GET(req: NextRequest) {
  return simulatePayment(req);
}

export async function POST(req: NextRequest) {
  return simulatePayment(req);
}
