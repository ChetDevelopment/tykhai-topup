import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment } from "@/lib/payment";
import { updateUserTotalSpent } from "@/lib/auth";
import { sendOrderReceipt } from "@/lib/email";

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  let order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber.toUpperCase() },
    include: {
      game: { select: { name: true, slug: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Sync payment status from payment gateway when webhook isn't reachable (localhost dev).
  // Only poll while the order is still PENDING and we have a transaction id.
  if (order.status === "PENDING" && order.paymentRef && !order.paymentRef.startsWith("SIM-")) {
    try {
      const remote = await checkBakongPayment(order.paymentRef);
      console.log("[order] checkBakongPayment:", order.paymentRef, "→", remote);

      if (remote) {
        const isPaid = remote?.paid === true || remote?.status === "paid";
        if (isPaid) {
          order = await prisma.order.update({
            where: { id: order.id },
            data: { status: "DELIVERED", paidAt: new Date(), deliveredAt: new Date() },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });
          if (order.userId) {
            await updateUserTotalSpent(order.userId, order.amountUsd);
          }
          if (order.customerEmail) {
            await sendOrderReceipt({
              orderNumber: order.orderNumber,
              gameName: order.game.name,
              productName: order.product.name,
              playerUid: order.playerUid,
              amountUsd: order.amountUsd,
              amountKhr: order.amountKhr,
              currency: order.currency,
              paidAt: order.paidAt,
              deliveredAt: order.deliveredAt,
              status: order.status,
              customerEmail: order.customerEmail,
            });
          }
        } else if (remote?.status === "expired" || remote?.status === "failed") {
          order = await prisma.order.update({
            where: { id: order.id },
            data: {
              status: remote.status === "expired" ? "CANCELLED" : "FAILED",
              failureReason: `Payment ${remote.status}`,
            },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });
        }
      }
      
      // For static QR - trust payment after 30 seconds if still PENDING
      // (Static QR doesn't report PAID status via API, so we trust user)
      if (order.status === "PENDING") {
        const timeSinceCreated = Date.now() - new Date(order.createdAt).getTime();
        if (timeSinceCreated > 30000) {
          order = await prisma.order.update({
            where: { id: order.id },
            data: { status: "DELIVERED", paidAt: new Date(), deliveredAt: new Date() },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });
          if (order.userId) {
            await updateUserTotalSpent(order.userId, order.amountUsd);
          }
          if (order.customerEmail) {
            await sendOrderReceipt({
              orderNumber: order.orderNumber,
              gameName: order.game.name,
              productName: order.product.name,
              playerUid: order.playerUid,
              amountUsd: order.amountUsd,
              amountKhr: order.amountKhr,
              currency: order.currency,
              paidAt: order.paidAt,
              deliveredAt: order.deliveredAt,
              status: order.status,
              customerEmail: order.customerEmail,
            });
          }
        }
      }
    } catch {
      // Silently ignore poll errors â€” we'll retry on the next request.
    }
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    status: order.status,
    gameName: order.game.name,
    gameSlug: order.game.slug,
    productName: order.product.name,
    playerUid: order.playerUid,
    serverId: order.serverId,
    amountUsd: order.amountUsd,
    amountKhr: order.amountKhr,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentRef: order.paymentRef,
    paymentUrl: order.paymentUrl,
    qrString: order.qrString,
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
  });
}
