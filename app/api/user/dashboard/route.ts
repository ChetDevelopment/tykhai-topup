import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, orders, savedUids] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        image: true,
        vipRank: true, 
        totalSpentUsd: true, 
        pointsBalance: true,
        createdAt: true,
        orders: { select: { amountUsd: true } }
      }
    }),
    prisma.order.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        game: { select: { name: true, imageUrl: true } },
        product: { select: { name: true } }
      }
    }),
    prisma.savedUid.findMany({
      where: { userId: session.userId },
      include: {
        game: { select: { name: true, imageUrl: true } }
      }
    })
  ]);

  const totalSpentCalculated = orders.reduce((sum, order) => sum + order.amountUsd, 0);

  return NextResponse.json({ 
    user: { ...user, totalSpentUsd: totalSpentCalculated }, 
    orders, 
    savedUids 
  });
}
