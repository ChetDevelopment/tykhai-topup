import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  
  const body = await req.json().catch(() => ({}));
  const { userId, amount } = body;

  if (!userId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      walletBalance: { increment: amount },
      referralEarnings: { increment: amount }
    }
  });

  await writeAudit({
    action: "referral.payout",
    targetType: "user",
    targetId: userId,
    details: JSON.stringify({ amount, admin: admin.email })
  });

  return NextResponse.json({ success: true, newBalance: user.walletBalance + amount });
}