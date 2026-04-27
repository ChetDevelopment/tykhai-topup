import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { checkBakongPayment } from "@/lib/payment";
import { notifyTelegram, escapeHtml } from "@/lib/telegram";
import { updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const md5Hash = body.md5 || body.md5hash || body.transaction_id;
    
    if (!md5Hash) {
      return NextResponse.json({ error: "Missing md5 hash" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { paymentRef: md5Hash },
      include: { game: true, product: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await checkBakongPayment(md5Hash);
    if (!result || !result.paid) {
      return NextResponse.json({ status: "UNPAID" });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        paidAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    if (order.userId) {
      await updateUserTotalSpent(order.userId, order.amountUsd);
    }

    const baseUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    const link = baseUrl ? `\n<a href="${baseUrl}/admin/orders/${order.orderNumber}">Open in admin</a>` : "";
    await notifyTelegram(
      `💰 <b>New paid order (Bakong)</b>\n` +
        `<b>#${escapeHtml(order.orderNumber)}</b>\n` +
        `${escapeHtml(order.game.name)} — ${escapeHtml(order.product.name)}\n` +
        `UID: <code>${escapeHtml(order.playerUid)}</code>\n` +
        `Amount: ${order.currency === "KHR"
          ? `${Math.round(order.amountKhr ?? 0).toLocaleString()} KHR`
          : `$${order.amountUsd.toFixed(2)}`}${link}`
    );

    return NextResponse.json({ status: "PAID", orderNumber: order.orderNumber });
  } catch (err) {
    console.error("[bakong-webhook] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}