export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { processDeliveryQueue, reconcileMissedPayments, acquireCronLock, releaseCronLock } from "@/lib/payment";

/**
 * POST /api/cron/process-deliveries
 * 
 * RECOVERY-ONLY background worker.
 * Not the primary payment or delivery path.
 * 
 * PURPOSES:
 * 1. Process stuck delivery jobs (failed retries, crashed workers)
 * 2. Reconcile missed payments (webhook never arrived)
 * 3. Clean up expired locks
 * 
 * SECURITY: Protected by CRON_SECRET env var
 * SAFETY: Uses execution lock to prevent overlapping runs
 * 
 * Called by Vercel Cron every 5 minutes.
 */
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

  // Acquire cron execution lock
  const lockAcquired = await acquireCronLock();
  if (!lockAcquired) {
    return NextResponse.json({
      success: false,
      reason: "Another cron instance is running",
      skipped: true,
    });
  }

  try {
    const results: Record<string, unknown> = {};

    // 1. Process pending delivery jobs
    const deliveryResults = await processDeliveryQueue(20);
    results.delivery = deliveryResults;

    // 2. Reconcile missed payments (only if few deliveries processed)
    if (deliveryResults.processed < 5) {
      const reconcileResults = await reconcileMissedPayments();
      results.reconciliation = reconcileResults;
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  } finally {
    await releaseCronLock();
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/process-deliveries",
    description: "Background delivery worker (recovery only)",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
  });
}
