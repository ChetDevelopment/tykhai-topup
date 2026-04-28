import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { decryptField, encryptField } from "@/lib/encryption";
import { z } from "zod";

const settingsSchema = z.object({
  siteName: z.string().min(1).optional(),
  exchangeRate: z.number().positive().optional(),
  supportTelegram: z.string().optional(),
  supportEmail: z.string().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().nullable().optional(),
  announcement: z.string().nullable().optional(),
  announcementTone: z.enum(["info", "warning", "promo"]).nullable().optional(),
  popupActive: z.boolean().optional(),
  popupTitle: z.string().nullable().optional(),
  popupContent: z.string().nullable().optional(),
  popupImageUrl: z.string().nullable().optional(),
  telegramBotToken: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
});

function readSecret(value: string | null | undefined) {
  return decryptField(value) ?? value ?? null;
}

function serializeSettings<T extends { telegramBotToken?: string | null; telegramChatId?: string | null }>(
  settings: T
) {
  return {
    ...settings,
    telegramBotToken: readSecret(settings.telegramBotToken),
    telegramChatId: readSecret(settings.telegramChatId),
  };
}

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return NextResponse.json(serializeSettings(settings));
}

export async function PATCH(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const updateData = {
    ...parsed.data,
    ...("telegramBotToken" in parsed.data
      ? { telegramBotToken: encryptField(parsed.data.telegramBotToken) }
      : {}),
    ...("telegramChatId" in parsed.data
      ? { telegramChatId: encryptField(parsed.data.telegramChatId) }
      : {}),
  };

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: updateData,
    create: { id: 1, ...updateData },
  });

  return NextResponse.json(serializeSettings(settings));
}

