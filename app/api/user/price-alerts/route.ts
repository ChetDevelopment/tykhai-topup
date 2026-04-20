import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const alertSchema = z.object({
  productId: z.string().min(1),
  targetPrice: z.number().positive(),
});

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alerts = await prisma.priceAlert.findMany({
    where: { userId: session.userId, notified: false },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(alerts);
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const alert = await prisma.priceAlert.upsert({
    where: {
      userId_productId: {
        userId: session.userId,
        productId: parsed.data.productId
      }
    },
    update: { targetPrice: parsed.data.targetPrice, notified: false },
    create: {
      userId: session.userId,
      productId: parsed.data.productId,
      targetPrice: parsed.data.targetPrice,
    }
  });

  return NextResponse.json(alert);
}

export async function DELETE(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { productId } = body;

  if (!productId) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  await prisma.priceAlert.deleteMany({
    where: { userId: session.userId, productId }
  });

  return NextResponse.json({ ok: true });
}