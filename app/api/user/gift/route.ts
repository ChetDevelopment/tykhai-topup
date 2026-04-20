import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const giftSchema = z.object({
  productId: z.string().min(1),
  recipientUid: z.string().min(4).max(20),
  recipientGameId: z.string().min(1),
  serverId: z.string().optional(),
  message: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Please login to send gifts" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = giftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const [product, settings] = await Promise.all([
    prisma.product.findUnique({ where: { id: parsed.data.productId } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  if (!product || !settings) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || user.walletBalance < product.priceUsd) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { id: parsed.data.recipientGameId },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { walletBalance: { decrement: product.priceUsd } }
  });

  const orderNumber = `GIFT-${Date.now().toString(36).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
      gameId: game.id,
      productId: product.id,
      playerUid: parsed.data.recipientUid,
      serverId: parsed.data.serverId,
      amountUsd: 0,
      amountKhr: null,
      currency: "USD",
      paymentMethod: "WALLET",
      status: "PENDING",
      userId: session.userId,
    }
  });

  return NextResponse.json({
    success: true,
    orderNumber,
    recipientUid: parsed.data.recipientUid,
    gameName: game.name,
    productName: product.name,
  });
}