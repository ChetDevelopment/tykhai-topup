import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { writeAudit } from "@/lib/audit";
import { guardAdminApi } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const existing = await prisma.faq.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const faq = await prisma.faq.update({ where: { id: params.id }, data: parsed.data });
  await writeAudit({
    action: "faq.update",
    targetType: "faq",
    targetId: params.id,
    details: parsed.data,
  });
  return NextResponse.json(faq);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const existing = await prisma.faq.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.faq.delete({ where: { id: params.id } });
  await writeAudit({ action: "faq.delete", targetType: "faq", targetId: params.id });
  return NextResponse.json({ ok: true });
}
