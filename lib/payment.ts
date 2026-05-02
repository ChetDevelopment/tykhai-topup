// @ts-nocheck
/**
 * Production-Grade Payment System for Ty Khai TopUp
 * 
 * ARCHITECTURE PRINCIPLES:
 * 1. Webhook = PRIMARY source of truth for payment state
 * 2. Verify = READ-ONLY payment status check (no mutations)
 * 3. Cron = RECOVERY only (missed webhooks, stuck jobs)
 * 4. Delivery = QUEUE-BASED, never executed in request flow
 * 5. Locking = DB-level optimistic locks prevent race conditions
 * 
 * STATE MACHINE:
 * PENDING → (webhook/verify confirms) → PAID → (enqueue) → QUEUED
 *                                                  ↓ (worker)
 *                                            DELIVERING → DELIVERED
 *                                                       ↓ (fail)
 *                                                 FAILED_RETRY → (retry) → DELIVERING
 *                                                              ↓ (max attempts)
 *                                                         FAILED_FINAL
 * 
 * CONCURRENCY MODEL:
 * - Each order has lockUntil/lockedBy fields
 * - Only one process can hold a lock at a time
 * - Locks expire after 30 seconds (safety net for crashed processes)
 */

import crypto from "crypto";
import {
  PaymentMethod,
  PaymentCurrency,
  InitiatePaymentArgs,
  PaymentInitResult,
  PaymentVerificationResult,
  PaymentError,
  PaymentStatus,
  PAYMENT_PROVIDERS,
} from "./payment-types";
import { hashSha256, encryptField } from "./encryption";
import { prisma } from "./prisma";
import { logSecurityEvent } from "./security";
import { createGameDropOrder } from "./gamedrop";
import { createG2BulkOrder } from "./g2bulk";

// ===================== KHQR Generation =====================

function tl(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ===================== Configuration =====================

const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true";
const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT || "";
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || "";
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || "Phnom Penh";
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || "";
const BAKONG_API_BASE = process.env.BAKONG_API_BASE || "https://api-bakong.nbc.gov.kh";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const GAMEDROP_TOKEN = process.env.GAMEDROP_TOKEN || "";
const G2BULK_TOKEN = process.env.G2BULK_TOKEN || "";

// Debug: Log Bakong configuration on startup
console.log("[bakong] Configuration loaded:", {
  hasToken: !!BAKONG_TOKEN,
  tokenPrefix: BAKONG_TOKEN ? BAKONG_TOKEN.slice(0, 10) + "..." : "MISSING",
  apiBase: BAKONG_API_BASE,
  account: BAKONG_ACCOUNT ? "SET" : "MISSING",
  merchantName: BAKONG_MERCHANT_NAME,
});

// Lock settings
const LOCK_DURATION_MS = 30_000; // 30 seconds
const LOCK_TIMEOUT_MS = 60_000; // 60 seconds for delivery operations

// ===================== QR Generation =====================

export async function initiatePayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const provider = PAYMENT_PROVIDERS[args.method];
  if (!provider?.enabled) {
    if (SIM_MODE && args.method !== "BAKONG") {
      return initiateSimulatedPayment(args);
    }
    throw PaymentError.configurationError(args.method);
  }

  const handlers: Partial<Record<PaymentMethod, (args: InitiatePaymentArgs) => Promise<PaymentInitResult>>> = {
    BAKONG: initiateBakong,
    WALLET: initiateWallet,
  };

  const handler = handlers[args.method];
  if (!handler) {
    throw new PaymentError(`Unsupported payment method: ${args.method}`, "UNSUPPORTED_METHOD", 400);
  }

  return handler(args);
}

async function initiateBakong(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  if (!BAKONG_ACCOUNT || !BAKONG_MERCHANT_NAME) {
    throw PaymentError.configurationError("Bakong");
  }

  const isKhr = args.currency === "KHR";
  const amount = isKhr ? args.amountKhr : args.amountUsd;

  if (!amount || amount <= 0) {
    throw PaymentError("Invalid amount", "INVALID_AMOUNT", 400);
  }

  const paymentRef = `TY${Date.now()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const creationTimestamp = Date.now().toString();
  const expirationTimestamp = expiresAt.getTime().toString();
  const currencyCode = isKhr ? "116" : "840";
  const amountStr = Number(amount).toFixed(2).replace(/\.?0+$/, "").padStart(11, "0");

  let qrString = "";
  qrString += tl("00", "01");
  qrString += tl("01", "12");
  qrString += tl("29", tl("00", BAKONG_ACCOUNT));
  qrString += tl("52", "5999");
  qrString += tl("53", currencyCode);
  qrString += tl("54", amountStr);
  qrString += tl("58", "KH");
  qrString += tl("59", BAKONG_MERCHANT_NAME);
  qrString += tl("60", BAKONG_MERCHANT_CITY);

  const timestampInner = tl("00", creationTimestamp) + tl("01", expirationTimestamp);
  qrString += tl("99", timestampInner);

  if (paymentRef) {
    qrString += tl("62", tl("01", paymentRef));
  }

  const crcPrefix = "6304";
  qrString += crcPrefix + crc16(qrString + crcPrefix);

  const md5String = crypto.createHash("md5").update(qrString).digest("hex");
  const qrStringEnc = encryptField(qrString);

  await logPaymentEvent({
    orderNumber: args.orderNumber,
    paymentRef,
    event: "INITIATED",
    provider: "BAKONG",
    amount: Number(amount),
    currency: isKhr ? "KHR" : "USD",
  });

  return {
    paymentRef,
    redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
    qrString,
    qrStringEnc,
    md5String,
    expiresAt,
    instructions: `Scan this KHQR code with Bakong app to pay ${amount} ${isKhr ? "KHR" : "USD"}`,
  };
}

async function initiateWallet(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const paymentRef = `WALLET-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef,
    redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
    qrString: null,
    qrStringEnc: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Pay ${amount} ${args.currency} from your Ty Khai Wallet`,
  };
}

async function initiateSimulatedPayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const ref = `SIM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=${args.method}`,
    qrString: null,
    qrStringEnc: null,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    instructions: `[SIMULATION] Pay ${amount} ${args.currency} using ${args.method}`,
  };
}

// ===================== Bakong API =====================

async function bakongApiRequest(endpoint: string, payload: unknown): Promise<any> {
  const response = await fetch(`${BAKONG_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BAKONG_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Bakong API error: ${response.status} - ${body}`);
  }

  return JSON.parse(body);
}

export async function checkBakongPayment(md5Hash: string): Promise<PaymentVerificationResult> {
  if (!BAKONG_TOKEN) {
    console.error("[bakong] FATAL: BAKONG_TOKEN not configured");
    throw PaymentError.configurationError("Bakong");
  }

  if (!md5Hash || md5Hash.length !== 32) {
    console.error("[bakong] Invalid MD5 hash:", { md5Hash, length: md5Hash?.length });
    return { status: "FAILED", paid: false, message: `Invalid MD5 hash` };
  }

  console.log("[bakong] ======= START CHECK =======");
  console.log("[bakong] Checking payment with MD5:", md5Hash);
  console.log("[bakong] MD5 length:", md5Hash.length);
  console.log("[bakong] BAKONG_API_BASE:", process.env.BAKONG_API_BASE || "https://api-bakong.nbc.gov.kh");
  console.log("[bakong] BAKONG_TOKEN exists:", !!BAKONG_TOKEN);

  try {
    const payload = { md5: md5Hash };
    console.log("[bakong] Sending request:", JSON.stringify(payload));

    const result = await bakongApiRequest("/v1/check_transaction_by_md5", payload);

    console.log("[bakong] Raw API response (full):", JSON.stringify(result, null, 2));

    // Handle ALL possible response formats
    const responseCode = result.responseCode ?? result.code ?? result.statusCode;
    const data = result.data ?? result.result ?? result.transaction ?? result;

    console.log("[bakong] Parsed responseCode:", responseCode);
    console.log("[bakong] Parsed data object:", JSON.stringify(data));

    // Check if transaction exists (responseCode 0 = success)
    if (responseCode === 0 && data) {
      const status = String(data.status ?? data.state ?? data.transactionStatus ?? "").toUpperCase();
      const amount = data.amount ?? data.amountValue ?? data.paidAmount;
      const currency = data.currency ?? "USD";
      const transactionId = data.hash ?? data.transactionId ?? data.ref ?? md5Hash;
      const paidAtMs = data.acknowledgedDateMs ?? data.acknowledgedDate ?? data.completedAt ?? data.transactionDate;

      // Check ALL possible "paid" status strings
      const isPaid = 
        status === "PAID" || 
        status === "COMPLETED" || 
        status === "SETTLED" ||
        status === "SUCCESS" ||
        String(data.paid) === "true" ||
        data.paymentStatus === "PAID";

      console.log("[bakong] ======= FINAL DECISION =======");
      console.log("[bakong] Status from API:", status);
      console.log("[bakong] isPaid decision:", isPaid);
      console.log("[bakong] Amount:", amount, "Currency:", currency);
      console.log("[bakong] Transaction ID:", transactionId);

      return {
        status: isPaid ? "PAID" : "PENDING",
        paid: isPaid,
        paidAt: paidAtMs ? new Date(paidAtMs) : undefined,
        transactionId,
        amount: amount ? parseFloat(String(amount)) : undefined,
        currency,
        rawResponse: result, // Store full response for debugging
      };
    }

    // Transaction not found or not paid yet
    console.log("[bakong] ======= NOT PAID =======");
    console.log("[bakong] responseCode:", responseCode, "(0 = success, other = error)");
    console.log("[bakong] Has data?:", !!data);
    if (data) {
      console.log("[bakong] Data content:", JSON.stringify(data));
    }
    
    return { status: "PENDING", paid: false, rawResponse: result };
  } catch (err) {
    console.error("[bakong] API request failed:", err);
    return {
      status: "FAILED",
      paid: false,
      message: err instanceof Error ? err.message : "Bakong API error",
    };
  }
}

// ===================== Amount Validation =====================

export function validatePaymentAmount(
  expectedUsd: number,
  expectedKhr: number | null | undefined,
  paidAmount: number,
  currency: string
): { valid: boolean; message?: string } {
  const tolerance = 0.01;

  if (currency === "KHR") {
    if (typeof expectedKhr !== "number") {
      return { valid: false, message: "KHR amount not set" };
    }
    if (Math.abs(paidAmount - expectedKhr) > tolerance) {
      return { valid: false, message: `Amount mismatch: expected ${expectedKhr} KHR, got ${paidAmount} KHR` };
    }
  } else {
    if (Math.abs(paidAmount - expectedUsd) > tolerance) {
      return { valid: false, message: `Amount mismatch: expected ${expectedUsd} USD, got ${paidAmount} USD` };
    }
  }

  return { valid: true };
}

// ===================== Logging =====================

async function logPaymentEvent(entry: {
  orderNumber: string;
  paymentRef: string;
  event: string;
  provider: string;
  amount?: number;
  currency?: string;
  status?: PaymentStatus;
  details?: unknown;
}) {
  try {
    await logSecurityEvent("PAYMENT_EVENT", {
      orderNumber: entry.orderNumber,
      paymentRef: entry.paymentRef,
      event: entry.event,
      provider: entry.provider,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      ...(typeof entry.details === "object" && entry.details ? entry.details : {}),
    }, {} as any);
  } catch {
    // Don't let logging failures break payment flow
  }
}

// ============================================================================
// DISTRIBUTED LOCKING (DB-level optimistic locks)
// Prevents webhook, verify, and cron from processing the same order concurrently
// ============================================================================

/**
 * Acquire an optimistic lock on an order.
 * Returns the order if lock acquired, null if already locked.
 * 
 * Lock semantics:
 * - If lockUntil < now(), lock is expired and can be stolen
 * - If lockedBy matches, lock is held by caller (re-entrant)
 * - Otherwise, lock is held by another process
 */
export async function acquireOrderLock(
  orderId: string,
  lockedBy: string,
  durationMs: number = LOCK_DURATION_MS
): Promise<{ locked: boolean; order?: any }> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + durationMs);

  // Try to acquire: either no lock exists, or lock is expired, or we already hold it
  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      OR: [
        { lockUntil: null }, // No lock
        { lockUntil: { lt: now } }, // Expired lock
        { lockedBy }, // We already hold it
      ],
    },
    data: {
      lockUntil: lockExpiry,
      lockedBy,
    },
  });

  if (result.count === 0) {
    return { locked: false };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true, game: true },
  });

  return { locked: true, order };
}

/**
 * Release a lock on an order.
 * Only releases if the caller holds the lock.
 */
export async function releaseOrderLock(orderId: string, lockedBy: string): Promise<void> {
  await prisma.order.updateMany({
    where: {
      id: orderId,
      lockedBy,
    },
    data: {
      lockUntil: null,
      lockedBy: null,
    },
  });
}

/**
 * Extend a lock by a given duration.
 * Used for long-running operations like delivery.
 */
export async function extendOrderLock(
  orderId: string,
  lockedBy: string,
  additionalMs: number
): Promise<boolean> {
  const newExpiry = new Date(Date.now() + additionalMs);

  const result = await prisma.order.updateMany({
    where: {
      id: orderId,
      lockedBy,
    },
    data: {
      lockUntil: newExpiry,
    },
  });

  return result.count > 0;
}

// ============================================================================
// PAYMENT VERIFICATION (Webhook + Polling)
// ONLY updates order to PAID. Never triggers delivery directly.
// ============================================================================

/**
 * Mark order as PAID after payment confirmation.
 * This is the SINGLE SOURCE OF TRUTH - ONLY function that transitions PENDING → PAID.
 * 
 * Called by:
 * - Webhook handler (primary)
 * - Verify endpoint (secondary, when polling detects payment)
 * - Cron reconciliation (recovery for missed events)
 * 
 * After marking PAID, it enqueues a delivery job (does NOT execute delivery).
 * 
 * STRICT STATE MACHINE:
 * PENDING → PAID → QUEUED → DELIVERING → DELIVERED
 * Rejects: PAID → PAID (idempotent), DELIVERED → PAID (invalid)
 */
export async function markOrderPaid(orderId: string, paymentData: {
  paymentRef: string;
  amount: number;
  currency: string;
  transactionId?: string;
  verifiedBy: "webhook" | "verify" | "cron" | "polling";
}): Promise<{ success: boolean; status: string; message?: string }> {
  const processorId = `payment_${paymentData.verifiedBy}_${Date.now()}`;

  // Acquire lock (prevents race conditions)
  const lock = await acquireOrderLock(orderId, processorId);
  if (!lock.locked || !lock.order) {
    return { success: false, status: "LOCKED", message: "Order is being processed by another request" };
  }

  const order = lock.order;

  // STRICT STATE MACHINE: Only allow PENDING → PAID
  const allowedTransitions: Record<string, string[]> = {
    "PENDING": ["PAID"],
    // Any other state = reject (idempotent for completed, invalid for others)
  };

  if (order.status !== "PENDING") {
    // Idempotency check: already in a post-PAID state
    const completedStates = ["PAID", "QUEUED", "DELIVERING", "DELIVERED"];
    if (completedStates.includes(order.status)) {
      await releaseOrderLock(orderId, processorId);
      console.log(`[payment] Idempotent: order ${order.orderNumber} already ${order.status}`);
      return { success: true, status: order.status, message: "Order already processed" };
    }
    
    // Invalid transition attempt
    await releaseOrderLock(orderId, processorId);
    console.error(`[payment] Invalid state transition: ${order.status} → PAID`);
    return { success: false, status: order.status, message: `Invalid transition from ${order.status}` };
  }

  try {
    // Atomic transition: PENDING → PAID + enqueue delivery job
    const updateResult = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "PENDING",
        lockedBy: processorId,
      },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentRef: paymentData.paymentRef,
        paymentRefEnc: encryptField(paymentData.paymentRef),
      },
    });

    if (updateResult.count === 0) {
      // Order was not PENDING - check current state
      const currentOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      await releaseOrderLock(orderId, processorId);
      return {
        success: false,
        status: currentOrder?.status || "UNKNOWN",
        message: "Order is no longer in PENDING state",
      };
    }

    // Enqueue delivery job (does NOT execute delivery)
    await prisma.deliveryJob.create({
      data: {
        orderId,
        status: "PENDING",
        maxAttempts: order.maxDeliveryAttempts,
        nextAttemptAt: new Date(), // Process immediately
      },
    });

    // Update order status to QUEUED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "QUEUED",
        deliveryStatus: "QUEUED",
      },
    });

    await logPaymentEvent({
      orderNumber: order.orderNumber,
      paymentRef: paymentData.paymentRef,
      event: "payment_verified",
      provider: "BAKONG",
      amount: paymentData.amount,
      currency: paymentData.currency,
      status: "PAID",
      details: { transactionId: paymentData.transactionId, verifiedBy: paymentData.verifiedBy },
    });

    await releaseOrderLock(orderId, processorId);

    return {
      success: true,
      status: "QUEUED",
      message: "Payment verified, delivery queued",
    };
  } catch (err) {
    await releaseOrderLock(orderId, processorId);
    return {
      success: false,
      status: "FAILED",
      message: err instanceof Error ? err.message : "Failed to mark order paid",
    };
  }
}

/**
 * READ-ONLY payment status check.
 * Does NOT mutate order state.
 * Used by polling to check if payment is confirmed.
 */
export async function checkPaymentStatus(orderId: string): Promise<{
  status: string;
  isPaid: boolean;
  bakongStatus?: string;
  message?: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      deliveryStatus: true,
      metadata: true,
      orderNumber: true,
      paymentRef: true,
      amountUsd: true,
      amountKhr: true,
      currency: true,
    },
  });

  if (!order) {
    return { status: "NOT_FOUND", isPaid: false, message: "Order not found" };
  }

  // Already in a confirmed state
  if (order.status === "PAID" || order.status === "QUEUED" || order.status === "DELIVERING" || order.status === "DELIVERED") {
    return { status: order.status, isPaid: true };
  }

  // Terminal state
  if (order.status === "FAILED" || order.status === "CANCELLED") {
    return { status: order.status, isPaid: false };
  }

  // PENDING - check Bakong API
  const md5Hash = (order as any).metadata?.bakongMd5;
  if (!md5Hash) {
    return { status: "PENDING", isPaid: false, message: "No MD5 hash found" };
  }

  try {
    const bakongResult = await checkBakongPayment(md5Hash);
    return {
      status: bakongResult.status,
      isPaid: bakongResult.paid,
      bakongStatus: bakongResult.rawResponse ? String((bakongResult.rawResponse as any).status) : undefined,
    };
  } catch {
    return { status: "PENDING", isPaid: false, message: "Bakong API error" };
  }
}

// ============================================================================
// DELIVERY QUEUE WORKER
// Processes delivery jobs asynchronously. Never called from request handlers.
// ============================================================================

/**
 * Process pending delivery jobs from the queue.
 * Called by:
 * - Cron job (recovery, every 5 minutes)
 * - Manual trigger (admin panel)
 * 
 * This is the ONLY place where delivery is executed.
 * 
 * DELIVERY SAFETY: Ensures delivery runs only ONCE per order.
 * Guard: if deliveryStatus === "DELIVERED" → skip immediately.
 */
export async function processDeliveryQueue(limit: number = 20): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  const workerId = `worker_${Date.now()}`;

  // Fetch pending jobs that are ready to process
  const jobs = await prisma.deliveryJob.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: new Date() },
    },
    take: limit,
    orderBy: { attemptNumber: "asc" },
    include: { order: { include: { game: true, product: true } } },
  });

  if (jobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      // DELIVERY SAFETY: Check if already delivered (idempotent)
      if (job.order.deliveryStatus === "DELIVERED" || job.order.status === "DELIVERED") {
        console.log(`[delivery] Order ${job.order.orderNumber} already delivered - skipping`);
        await prisma.deliveryJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        skipped++;
        continue;
      }

      // Acquire order lock
      const orderLock = await acquireOrderLock(job.orderId, workerId);
      if (!orderLock.locked) {
        skipped++;
        continue;
      }

    try {
      // Update job to PROCESSING
      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: "PROCESSING",
          attempt: { increment: 1 },
          startedAt: new Date(),
        },
      });

      // Update order status
      await prisma.order.update({
        where: { id: job.orderId },
        data: {
          status: "DELIVERING",
          deliveryStatus: "DELIVERING",
        },
      });

      // Execute delivery
      const deliveryResult = await executeDeliveryForJob(job);

      if (deliveryResult.success) {
        // Success
        await prisma.deliveryJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            providerResponse: deliveryResult.response || null,
          },
        });

        await prisma.order.update({
          where: { id: job.orderId },
          data: {
            status: "DELIVERED",
            deliveryStatus: "DELIVERED",
            deliveredAt: new Date(),
            deliveryNote: deliveryResult.message,
            metadata: {
              ...(job.order as any).metadata || {},
              deliveryTransactionId: deliveryResult.transactionId,
              deliveryProvider: deliveryResult.provider,
            },
          },
        });

        results.succeeded++;
      } else {
        // Failed - schedule retry or mark as final failure
        const currentAttempt = job.attempt + 1;

        if (currentAttempt >= job.maxAttempts) {
          // Max attempts reached - final failure
          await prisma.deliveryJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              errorMessage: deliveryResult.message,
              providerResponse: deliveryResult.response || null,
            },
          });

          await prisma.order.update({
            where: { id: job.orderId },
            data: {
              status: "FAILED_FINAL",
              deliveryStatus: "FAILED_FINAL",
              failureReason: `Delivery failed after ${currentAttempt} attempts: ${deliveryResult.message}`,
            },
          });
        } else {
          // Schedule retry with exponential backoff
          const backoffMs = Math.pow(2, currentAttempt) * 5 * 60 * 1000; // 5min, 10min, 20min
          const nextAttemptAt = new Date(Date.now() + backoffMs);

          await prisma.deliveryJob.update({
            where: { id: job.id },
            data: {
              status: "RETRYING",
              nextAttemptAt,
              errorMessage: deliveryResult.message,
              providerResponse: deliveryResult.response || null,
            },
          });

          await prisma.order.update({
            where: { id: job.orderId },
            data: {
              status: "FAILED_RETRY",
              deliveryStatus: "FAILED_RETRY",
              nextDeliveryAt: nextAttemptAt,
              deliveryNote: `Attempt ${currentAttempt} failed: ${deliveryResult.message}`,
            },
          });
        }

        results.failed++;
      }
    } catch (err) {
      // Unexpected error - reset job for retry
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
          errorMessage,
        },
      });

      await prisma.order.update({
        where: { id: job.orderId },
        data: {
          status: "QUEUED",
          deliveryStatus: "QUEUED",
        },
      });

      results.failed++;
    } finally {
      await releaseOrderLock(job.orderId, workerId);
    }
  }

  return results;
}

async function executeDeliveryForJob(job: any): Promise<{
  success: boolean;
  message: string;
  transactionId?: string;
  provider?: string;
  response?: string;
}> {
  const order = job.order;
  const { product, playerUid, serverId, customerEmail } = order;
  const idempotencyKey = `DELIVERY-${order.orderNumber}-${job.attempt + 1}`;

  try {
    if (product.gameDropOfferId) {
      const result = await createGameDropOrder(
        GAMEDROP_TOKEN,
        product.gameDropOfferId,
        playerUid,
        serverId || undefined,
        idempotencyKey,
        customerEmail || undefined
      );

      const success = result.status === "SUCCESS" || result.status === "PENDING";
      return {
        success,
        message: result.message || result.status,
        transactionId: result.transactionId,
        provider: "GAMEDROP",
        response: JSON.stringify(result),
      };
    } else if (product.g2bulkCatalogueName) {
      const result = await createG2BulkOrder(
        G2BULK_TOKEN,
        product.g2bulkCatalogueName,
        playerUid,
        serverId || undefined,
        idempotencyKey
      );

      return {
        success: result.success,
        message: result.message || (result.success ? "Order created" : "Order failed"),
        transactionId: result.orderId?.toString(),
        provider: "G2BULK",
        response: JSON.stringify(result),
      };
    } else {
      return {
        success: true,
        message: "Manual fulfillment required",
        provider: "MANUAL",
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Delivery execution error",
    };
  }
}

// ============================================================================
// RECONCILIATION JOB
// Checks for missed payments that webhook/polling failed to detect
// ============================================================================

/**
 * Reconcile orders that are stuck in PENDING but may have been paid.
 * Called by cron as a safety net.
 */
export async function reconcileMissedPayments(): Promise<{
  checked: number;
  recovered: number;
}> {
  const workerId = `reconcile_${Date.now()}`;

  // Find PENDING orders older than 2 minutes (allow time for webhook to arrive)
  const cutoffTime = new Date(Date.now() - 2 * 60 * 1000);

  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoffTime },
      paymentRef: { not: null },
      paymentRef: { not: { startsWith: "SIM-" } },
      metadata: { path: ["bakongMd5"], string_not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      paymentRef: true,
      amountUsd: true,
      amountKhr: true,
      currency: true,
      metadata: true,
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  const results = { checked: pendingOrders.length, recovered: 0 };

  for (const order of pendingOrders) {
    const md5Hash = (order as any).metadata?.bakongMd5;
    if (!md5Hash) continue;

    try {
      const bakongResult = await checkBakongPayment(md5Hash);

      if (bakongResult.paid) {
        // Validate amount
        const validation = validatePaymentAmount(
          order.amountUsd,
          order.currency === "KHR" ? order.amountKhr : undefined,
          bakongResult.amount ? parseFloat(String(bakongResult.amount)) : 0,
          order.currency
        );

        if (validation.valid) {
          const markResult = await markOrderPaid(order.id, {
            paymentRef: order.paymentRef || `RECONCILE-${md5Hash.slice(0, 16)}`,
            amount: bakongResult.amount ? parseFloat(String(bakongResult.amount)) : order.amountUsd,
            currency: bakongResult.currency || order.currency,
            transactionId: bakongResult.transactionId,
            verifiedBy: "cron",
          });

          if (markResult.success) {
            results.recovered++;
          }
        }
      }
    } catch {
      // Continue to next order
    }
  }

  return results;
}

// ============================================================================
// CRON EXECUTION LOCK
// Prevents overlapping cron runs
// ============================================================================

const CRON_LOCK_KEY = "cron_delivery_lock";
const CRON_LOCK_DURATION_MS = 4 * 60 * 1000; // 4 minutes (less than 5-minute cron interval)

export async function acquireCronLock(): Promise<boolean> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + CRON_LOCK_DURATION_MS);

  // Use Settings table as a distributed lock store
  const result = await prisma.settings.updateMany({
    where: {
      OR: [
        { id: 1, lastBalanceCheck: null },
        { id: 1, lastBalanceCheck: { lt: now } },
      ],
    },
    data: {
      lastBalanceCheck: lockExpiry,
    },
  });

  return result.count > 0;
}

export async function releaseCronLock(): Promise<void> {
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      lastBalanceCheck: null,
    },
  });
}
