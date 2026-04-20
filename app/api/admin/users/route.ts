import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { orders: true, savedUids: true }
        },
        orders: {
          where: { status: "DELIVERED" },
          select: { amountUsd: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Calculate total spent for each user
    const usersWithStats = users.map(user => {
      const totalSpent = user.orders.reduce((sum, order) => sum + order.amountUsd, 0);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        orderCount: user._count.orders,
        savedUidCount: user._count.savedUids,
        totalSpent: totalSpent,
        xp: Math.floor(totalSpent * 100),
      };
    });

    return NextResponse.json(usersWithStats);
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
