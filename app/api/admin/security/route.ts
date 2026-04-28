import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logSecurityEvent, getSecurityLogs, getSecurityStats } from "@/lib/logger";
import { isSuspiciousRequest } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    // Verify admin session
    await requireAdmin();
    
    // Check for suspicious request
    if (isSuspiciousRequest(req)) {
      logSecurityEvent("SECURITY", "Suspicious security log access attempt", req);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "stats";
    const count = parseInt(url.searchParams.get("count") || "50");

    if (type === "stats") {
      const stats = getSecurityStats();
      return NextResponse.json(stats);
    } else {
      const logs = getSecurityLogs(count);
      return NextResponse.json({ logs, total: logs.length });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    
    const body = await req.json();
    const { event, details } = body;
    
    logSecurityEvent("AUDIT", event || "Manual admin log", req, details);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
