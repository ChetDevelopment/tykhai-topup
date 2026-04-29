import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Payment simulation is DISABLED in production.
 * This endpoint should never be used for real orders.
 * All requests return 403 Forbidden.
 */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: "Payment simulation is disabled in production" },
    { status: 403 }
  );
}

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { error: "Payment simulation is disabled in production" },
    { status: 403 }
  );
}
