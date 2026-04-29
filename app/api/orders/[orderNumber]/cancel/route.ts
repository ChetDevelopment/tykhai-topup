import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { guardUserApi, ordersApiRateLimit } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const security = await guardUserApi(req, ordersApiRateLimit);
  if ("response" in security) return security.response;

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    select: { id: true, userId: true, status: true },
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
  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "Cannot cancel order that is not pending" },
      { status: 400 }
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "CANCELLED",
      failureReason: "User cancelled payment",
    },
  });

  return NextResponse.json({ success: true, message: "Order cancelled" });
}
