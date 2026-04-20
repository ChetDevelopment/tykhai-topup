import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      referrer: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const referralCode = user.id.slice(-6).toUpperCase();
  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/register?ref=${referralCode}`;

  const referredUsers = await prisma.user.findMany({
    where: { referredById: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      totalSpentUsd: true,
      referralEarnings: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" }
  });

  const totalReferrals = referredUsers.length;
  const totalEarnings = referredUsers.reduce((sum, u) => sum + (u.referralEarnings || 0), 0);

  return NextResponse.json({
    referralCode,
    referralLink,
    totalReferrals,
    totalEarnings,
    referrals: referredUsers,
  });
}