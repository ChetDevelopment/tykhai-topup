import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.userId;

  // Check if already checked in today (GMT+7 for Cambodia)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lastCheckin = await prisma.pointTransaction.findFirst({
    where: {
      userId,
      type: "DAILY_CHECKIN",
      createdAt: {
        gte: today,
      },
    },
  });

  if (lastCheckin) {
    return NextResponse.json({ error: "Already checked in today!" }, { status: 400 });
  }

  // Award 5 points
  await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId,
        amount: 5,
        type: "DAILY_CHECKIN",
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: {
          increment: 5,
        },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, pointsAwarded: 5 });
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ checkedIn: false });
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lastCheckin = await prisma.pointTransaction.findFirst({
    where: {
      userId: session.userId,
      type: "DAILY_CHECKIN",
      createdAt: {
        gte: today,
      },
    },
  });

  return NextResponse.json({ checkedIn: !!lastCheckin });
}
