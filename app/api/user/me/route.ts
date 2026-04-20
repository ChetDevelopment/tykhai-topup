import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const [boughtOrders, savedUids, recentOrders, wishlist, userData] = await Promise.all([
      prisma.order.findMany({
        where: {
          userId: user.userId,
          status: { in: ["PAID", "DELIVERED", "PROCESSING"] }
        },
        select: { productId: true }
      }),
      prisma.savedUid.findMany({
        where: { userId: user.userId },
        include: {
          game: { select: { id: true, name: true, slug: true, imageUrl: true, requiresServer: true, servers: true } }
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          userId: user.userId,
          status: { in: ["PAID", "DELIVERED", "PROCESSING"] }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          game: { select: { id: true, name: true, slug: true, imageUrl: true } },
          product: { select: { id: true, name: true, priceUsd: true } }
        }
      }),
      prisma.wishlist.findMany({
        where: { userId: user.userId },
        include: {
          product: { include: { game: { select: { name: true, slug: true } } } }
        }
      }),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { pointsBalance: true, walletBalance: true }
      })
    ]);

    const boughtProductIds = Array.from(new Set(boughtOrders.map(o => o.productId)));

    const quickData = recentOrders.map(o => ({
      gameSlug: o.game.slug,
      gameName: o.game.name,
      gameImage: o.game.imageUrl,
      productId: o.product.id,
      productName: o.product.name,
      lastPrice: o.product.priceUsd,
      playerUid: o.playerUid,
      serverId: o.serverId,
    }));

    return NextResponse.json({
      user,
      boughtProductIds,
      savedUids,
      quickData,
      wishlist: wishlist.map(w => ({
        productId: w.product.id,
        productName: w.product.name,
        priceUsd: w.product.priceUsd,
        gameName: w.product.game.name,
        gameSlug: w.product.game.slug,
      })),
      pointsBalance: userData?.pointsBalance || 0,
      walletBalance: userData?.walletBalance || 0,
    });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}