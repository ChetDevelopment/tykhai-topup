import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
});

export async function GET() {
  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { maintenanceMode: true, maintenanceMessage: true }
  });

  return NextResponse.json(settings || { maintenanceMode: false });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const body = await req.json().catch(() => ({}));
  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      maintenanceMode: parsed.data.enabled,
      maintenanceMessage: parsed.data.message || null,
    },
    create: {
      id: 1,
      maintenanceMode: parsed.data.enabled,
      maintenanceMessage: parsed.data.message || null,
    },
  });

  await writeAudit({
    action: parsed.data.enabled ? "maintenance.enable" : "maintenance.disable",
    targetType: "settings",
    details: parsed.data.message || undefined,
  });

  return NextResponse.json({ 
    success: true, 
    maintenanceMode: parsed.data.enabled,
    message: parsed.data.message 
  });
}