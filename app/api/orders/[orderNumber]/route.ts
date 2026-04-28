import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkBakongPayment } from "@/lib/payment";
import { updateUserTotalSpent } from "@/lib/auth";
import { sendOrderReceipt } from "@/lib/email";
import { decryptField } from "@/lib/encryption";
import { guardUserApi, ordersApiRateLimit } from "@/lib/api-security";

export async function GET(
  req: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  const security = await guardUserApi(req, ordersApiRateLimit);
  if ("response" in security) return security.response;

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
  if (!order.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.userId !== security.user.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.status === "PENDING" && order.paymentRef && !order.paymentRef.startsWith("SIM-")) {
    try {
      const remote = await checkBakongPayment(order.paymentRef);

      if (remote) {
        const isPaid = remote.paid === true || remote.status === "paid";
        if (isPaid) {
          order = await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "DELIVERED",
              paidAt: new Date(),
              deliveredAt: new Date(),
            },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });

          if (order.userId) {
            await updateUserTotalSpent(order.userId, order.amountUsd);
          }

          const customerEmail = decryptField(order.customerEmail) ?? order.customerEmail;
          if (customerEmail) {
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
              customerEmail,
            });
          }
        } else if (remote.status === "expired" || remote.status === "failed") {
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

      if (order.status === "PENDING") {
        const timeSinceCreated = Date.now() - new Date(order.createdAt).getTime();
        if (timeSinceCreated > 30000) {
          order = await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "DELIVERED",
              paidAt: new Date(),
              deliveredAt: new Date(),
            },
            include: {
              game: { select: { name: true, slug: true } },
              product: { select: { name: true } },
            },
          });

          if (order.userId) {
            await updateUserTotalSpent(order.userId, order.amountUsd);
          }

          const customerEmail = decryptField(order.customerEmail) ?? order.customerEmail;
          if (customerEmail) {
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
              customerEmail,
            });
          }
        }
      }
    } catch {
      // Ignore polling errors and retry on a later request.
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
