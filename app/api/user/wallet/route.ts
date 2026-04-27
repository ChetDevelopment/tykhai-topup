import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const topupSchema = z.object({
  amountUsd: z.number().min(1).max(500),
});

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { walletBalance: true, pointsBalance: true }
  });

  return NextResponse.json(user || { walletBalance: 0, pointsBalance: 0 });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return NextResponse.json({ error: "System unavailable" }, { status: 500 });
  }

  const walletOrder = await prisma.order.create({
    data: {
      orderNumber: `W-${Date.now().toString(36).toUpperCase()}`,
      gameId: "WALLET-TOPUP",
      productId: parsed.data.amountUsd.toString(),
      playerUid: session.userId,
      amountUsd: parsed.data.amountUsd,
      amountKhr: settings.exchangeRate ? Math.round(parsed.data.amountUsd * settings.exchangeRate) : null,
      currency: "USD",
      paymentMethod: "BAKONG",
      status: "PENDING",
      userId: session.userId,
    }
  });

  return NextResponse.json({ 
    orderNumber: walletOrder.orderNumber,
    amount: parsed.data.amountUsd
  });
}