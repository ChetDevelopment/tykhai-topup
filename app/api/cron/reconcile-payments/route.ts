export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkPendingPayments } from "@/lib/payment-worker";

/**
 * POST /api/cron/reconcile-payments
 * 
 * Payment reconciliation background worker.
 * Checks all PENDING orders against Bakong API.
 * 
 * PURPOSES:
 * 1. Check pending payments every minute
 * 2. Update orders that were paid but not detected
 * 3. Safety net for missed webhooks and polling failures
 * 
 * SECURITY: Protected by CRON_SECRET env var
 * SAFETY: Uses execution lock to prevent overlapping runs
 * 
 * Called by Vercel Cron every minute.
 */

// Simple in-memory lock for single-instance deployments
let isRunning = false;
let lastRunTime = 0;
const LOCK_TIMEOUT_MS = 60000; // 1 minute

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (bearerToken !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Prevent overlapping runs
  const now = Date.now();
  if (isRunning && (now - lastRunTime) < LOCK_TIMEOUT_MS) {
    return NextResponse.json({
      success: false,
      reason: "Another instance is running",
      skipped: true,
    });
  }

  isRunning = true;
  lastRunTime = now;

  try {
    console.log("[cron/reconcile-payments] Starting payment reconciliation");
    
    const results = await checkPendingPayments();
    
    console.log("[cron/reconcile-payments] Completed:", results);

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/reconcile-payments] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  } finally {
    isRunning = false;
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/reconcile-payments",
    description: "Payment reconciliation worker - checks PENDING orders every minute",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
  });
}
