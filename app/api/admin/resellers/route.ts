import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const resellerSchema = z.object({
  resellerId: z.string(),
  action: z.enum(["approve", "revoke", "set_discount"]),
  discount: z.number().min(0).max(100).optional(),
});

export async function GET() {
  await requireAdmin();
  
  const resellers = await prisma.user.findMany({
    where: { role: "RESELLER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      totalSpentUsd: true,
      pointsBalance: true,
      createdAt: true,
      _count: { select: { orders: true } }
    }
  });

  return NextResponse.json(resellers);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  
  const body = await req.json().catch(() => ({}));
  const parsed = resellerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { resellerId, action, discount } = parsed.data;

  switch (action) {
    case "approve":
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "RESELLER" }
      });
      await writeAudit({
        action: "reseller.approve",
        targetType: "user",
        targetId: resellerId,
      });
      break;
      
    case "revoke":
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "USER" }
      });
      await writeAudit({
        action: "reseller.revoke",
        targetType: "user",
        targetId: resellerId,
      });
      break;
      
    case "set_discount":
      if (discount === undefined) {
        return NextResponse.json({ error: "Discount required" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: resellerId },
        data: { role: "RESELLER" }
      });
      break;
  }

  return NextResponse.json({ ok: true });
}