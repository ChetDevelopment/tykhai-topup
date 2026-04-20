import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addSchema = z.object({
  productId: z.string().min(1),
});

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wishlist = await prisma.wishlist.findMany({
    where: { userId: session.userId },
    include: {
      product: {
        include: {
          game: { select: { id: true, name: true, slug: true, imageUrl: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(wishlist);
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId }
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const wishlist = await prisma.wishlist.upsert({
    where: {
      userId_productId: {
        userId: session.userId,
        productId: parsed.data.productId
      }
    },
    update: {},
    create: {
      userId: session.userId,
      productId: parsed.data.productId
    }
  });

  return NextResponse.json(wishlist);
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

  await prisma.wishlist.deleteMany({
    where: {
      userId: session.userId,
      productId
    }
  });

  return NextResponse.json({ ok: true });
}