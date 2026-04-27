import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { checkBakongPayment } from "@/lib/payment";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Admin debug endpoint: pulls the latest Bakong status for an order
 * and, if paid, flips the order to PAID.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!order.paymentRef || order.paymentRef.startsWith("SIM-")) {
    return NextResponse.json({ error: "No Bakong reference on order" }, { status: 400 });
  }

  const remote = await checkBakongPayment(order.paymentRef);

  let updated = order;
  if (remote && remote.paid && order.status === "PENDING") {
    updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }
    await writeAudit({
      action: "order.bakong_refresh.auto_paid",
      targetType: "order",
      targetId: order.id,
      details: { paymentRef: order.paymentRef, remote },
    });
  } else if (
    remote &&
    (remote.status === "expired" || remote.status === "failed") &&
    order.status === "PENDING"
  ) {
    updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "FAILED", failureReason: `Bakong: ${remote.status}` },
    });
    await writeAudit({
      action: "order.bakong_refresh.auto_failed",
      targetType: "order",
      targetId: order.id,
      details: { paymentRef: order.paymentRef, remote },
    });
  }

  await writeAudit({
    action: "order.bakong_refresh",
    targetType: "order",
    targetId: order.id,
    details: { paymentRef: order.paymentRef, remote, expectedAmount: order.amountUsd },
  });

  return NextResponse.json({ 
    remote, 
    order: updated,
    expectedAmount: order.amountUsd,
    paidAmount: remote?.amount,
  });
}