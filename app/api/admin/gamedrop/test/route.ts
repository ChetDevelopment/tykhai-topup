import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { checkGameDropBalance } from "@/lib/gamedrop";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.gameDropToken) {
    return NextResponse.json({ error: "No GameDrop token set" }, { status: 400 });
  }

  try {
    const data = await checkGameDropBalance(settings.gameDropToken);
    return NextResponse.json({ success: true, balance: data.balance });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
