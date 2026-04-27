import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber.toUpperCase() },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Cannot cancel order that is not pending" }, { status: 400 });
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