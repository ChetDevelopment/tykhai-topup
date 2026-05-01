import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const token = settings?.g2bulkToken;

    if (!token) {
      return NextResponse.json({ success: false, error: "G2Bulk token not configured" });
    }

    const res = await fetch("https://api.g2bulk.com/v1/getMe", {
      headers: { "X-API-Key": token },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `API error: ${res.status}` });
    }

    const data = await res.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: "Failed to connect to G2Bulk" });
    }

    // Update balance in settings
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        currentBalance: data.balance,
        lastBalanceCheck: new Date(),
        g2bulkPartnerId: data.user_id,
      },
    });

    return NextResponse.json({
      success: true,
      balance: data.balance,
      userId: data.user_id,
      username: data.username,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
