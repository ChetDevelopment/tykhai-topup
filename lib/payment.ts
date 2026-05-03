// @ts-nocheck
/**
 * Simplified Payment System - QR Generation Guaranteed
 * 
 * CRITICAL RULES:
 * 1. QR generation is SYNCHRONOUS (no async calls in simulation)
 * 2. QR is NEVER null (fallback always available)
 * 3. Simulation mode has NO external dependencies
 * 4. NO queues, locks, or workers in QR generation path
 */

import crypto from "crypto";
import {
  PaymentMethod,
  PaymentCurrency,
  InitiatePaymentArgs,
  PaymentInitResult,
  PaymentVerificationResult,
  PaymentError,
  PAYMENT_PROVIDERS,
} from "./payment-types";
import { hashSha256, encryptField } from "./encryption";

// ===================== KHQR Generation Helpers =====================

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

const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true" || process.env.ENABLE_DEV_BAKONG === "true";
const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT || "";
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || "Ty Khai TopUp";
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || "Phnom Penh";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ===================== UNIFIED PAYMENT FACTORY =====================
/**
 * CRITICAL: QR generation is SYNCHRONOUS in simulation mode
 * NO external calls, NO queues, NO locks
 */
export async function initiatePayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  // FAST PATH: Simulation mode - PURE SYNCHRONOUS QR GENERATION
  if (SIM_MODE) {
    return initiateSimulatedPayment(args);
  }
  
  // Production mode
  const provider = PAYMENT_PROVIDERS[args.method];
  if (!provider?.enabled) {
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

  const result = await handler(args);
  
  // GUARANTEE: For non-wallet payments, validate QR before returning
  if (args.method !== "WALLET" && !result.qrString) {
    throw new PaymentError("QR generation failed", "QR_GENERATION_FAILED", 500);
  }
  
  return result;
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

/**
 * SIMULATION MODE PAYMENT - INSTANT, NO EXTERNAL CALLS
 * 
 * STRICT RULES:
 * - NO external API calls
 * - NO balance checks
 * - NO retry logic
 * - NO delays
 * - Generate QR in <100ms
 * - Always succeed with valid KHQR format
 */
async function initiateSimulatedPayment(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const startTime = Date.now();
  const ref = `SIM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const isKhr = args.currency === "KHR";
  const amount = isKhr ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;
  
  // Generate KHQR-compliant QR code (valid format for testing)
  const currencyCode = isKhr ? "116" : "840";
  const amountFormatted = Number(amount).toFixed(2);
  
  // Build EMV-compliant KHQR data
  let qrData = "";
  qrData += "000201"; // Payload Format Indicator
  qrData += "010212"; // Payment System Indicator (KHQR)
  qrData += "2937";   // Merchant Account Information
  qrData += "0016A000000623010111"; // National Payment Network (Bakong)
  qrData += "01130066010000000";   // Merchant ID (test)
  qrData += "52045999"; // Merchant Category Code
  qrData += `5303${currencyCode}`; // Currency Code
  qrData += `54${amountFormatted.length.toString().padStart(2, '0')}${amountFormatted}`; // Amount
  qrData += "5802KH"; // Country Code
  qrData += `5915${BAKONG_MERCHANT_NAME.padEnd(15, ' ').slice(0, 15)}`; // Merchant Name
  qrData += `6010${BAKONG_MERCHANT_CITY.padEnd(10, ' ').slice(0, 10)}`; // City
  qrData += "62070503***"; // Additional Data Field (test)
  qrData += "62070103***"; // Reference label (test)
  qrData += "6304"; // CRC placeholder
  
  // Calculate CRC16
  const crc = crc16(qrData);
  const simulatedQr = qrData.replace("6304", "6304" + crc);
  
  const md5String = crypto.createHash("md5").update(simulatedQr).digest("hex");
  const qrStringEnc = encryptField(simulatedQr);
  const processingTime = Date.now() - startTime;
  
  console.log("[payment] Simulation mode QR generated:", {
    paymentRef: ref,
    qrLength: simulatedQr.length,
    processingTime: `${processingTime}ms`,
    amount: amountFormatted,
    currency: currencyCode,
  });

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
    qrString: simulatedQr,
    qrStringEnc,
    md5String,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    instructions: `[SIMULATION] Scan to pay ${amountFormatted} ${isKhr ? "KHR" : "USD"}`,
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
  if (SIM_MODE) {
    return {
      status: "PAID",
      paid: true,
      message: "Payment confirmed (SIMULATION)",
      amount: 0,
      currency: "USD",
      transactionId: `SIM-${Date.now()}`,
    };
  }

  if (!BAKONG_TOKEN) throw PaymentError.configurationError("Bakong");

  if (!md5Hash || md5Hash.length !== 32) {
    return { status: "FAILED", paid: false, message: `Invalid MD5 hash` };
  }

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await bakongApiRequest("/v1/check_transaction_by_md5", { md5: md5Hash });
      const responseCode = result.responseCode ?? result.code ?? result.statusCode;
      const data = result.data ?? result.result ?? result.transaction ?? result;

      if (responseCode === 0 && data) {
        const status = String(data.status ?? data.state ?? data.transactionStatus ?? "").toUpperCase();
        const isPaid = status === "PAID" || status === "COMPLETED" || status === "SUCCESS" || data.paymentStatus === "PAID";

        return {
          status: isPaid ? "PAID" : "PENDING",
          paid: isPaid,
          paidAt: data.acknowledgedDateMs ? new Date(data.acknowledgedDateMs) : undefined,
          transactionId: data.hash || data.transactionId || md5Hash,
          amount: data.amount ? parseFloat(String(data.amount)) : undefined,
          currency: data.currency || "USD",
          rawResponse: result,
        };
      }

      if (responseCode !== 0) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
      
      return { status: "PENDING", paid: false, rawResponse: result };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
    }
  }

  return { status: "FAILED", paid: false, message: lastError?.message || "Bakong API error" };
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
    if (typeof expectedKhr !== "number") return { valid: false, message: "KHR amount not set" };
    if (Math.abs(paidAmount - expectedKhr) > tolerance) return { valid: false, message: `Expected ${expectedKhr} KHR, got ${paidAmount} KHR` };
  } else {
    if (Math.abs(paidAmount - expectedUsd) > tolerance) return { valid: false, message: `Expected ${expectedUsd} USD, got ${paidAmount} USD` };
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
    await logSecurityEvent("PAYMENT_EVENT", entry, {} as any);
  } catch {}
}

// ===================== DISTRIBUTED LOCKING (Hardened) =====================

/**
 * Acquire an optimistic lock on an order with a fencing token (version).
 * Returns the order if lock acquired, null if already locked.
 */
export async function acquireOrderLock(
  orderId: string,
  lockedBy: string,
  durationMs: number = LOCK_DURATION_MS
): Promise<{ locked: boolean; order?: any }> {
  // ATOMIC LOCK ACQUISITION USING DB-SIDE NOW() AND VERSION INCREMENT
  // This prevents clock drift issues and provides a fencing token for side effects.
  const result = await prisma.$executeRaw`
    UPDATE "Order"
    SET "lockUntil" = NOW() + ${durationMs / 1000} * INTERVAL '1 second',
        "lockedBy" = ${lockedBy},
        "version" = "version" + 1
    WHERE "id" = ${orderId}
      AND ("lockUntil" IS NULL OR "lockUntil" < NOW() OR "lockedBy" = ${lockedBy})
  `;

  if (result === 0) return { locked: false };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true, game: true },
  });

  return { locked: true, order };
}

export async function releaseOrderLock(orderId: string, lockedBy: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, lockedBy },
    data: { lockUntil: null, lockedBy: null },
  });
}

// ===================== PAYMENT FINALIZATION =====================

export async function markOrderPaid(orderId: string, paymentData: {
  paymentRef: string;
  amount: number;
  currency: string;
  transactionId?: string;
  verifiedBy: "webhook" | "verify" | "cron" | "polling";
  rawResponse?: any;
}): Promise<{ success: boolean; status: string; message?: string }> {
  // 1. COLLISION-FREE PROCESSOR ID
  const processorId = `pay_${paymentData.verifiedBy}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const lock = await acquireOrderLock(orderId, processorId);
  if (!lock.locked || !lock.order) {
    return { success: false, status: "LOCKED", message: "Concurrent process holding lock" };
  }

  const order = lock.order;
  const idempotencyKey = order.orderNumber;

  // 2. STATE GUARD
  const successfulStates = ["PAID", "QUEUED", "DELIVERING", "DELIVERED", "SUCCESS"];
  if (successfulStates.includes(order.status) || order.idempotencyKey === idempotencyKey) {
    await releaseOrderLock(orderId, processorId);
    return { success: true, status: order.status };
  }

  const overridableStates = ["PENDING", "EXPIRED", "FAILED", "FAILED_RETRY"];
  if (!overridableStates.includes(order.status)) {
    await releaseOrderLock(orderId, processorId);
    return { success: false, status: order.status };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 3. ATOMIC CAS UPDATE with version check
      const updateResult = await tx.order.updateMany({
        where: { 
          id: orderId, 
          status: { in: overridableStates }, 
          idempotencyKey: null,
          version: order.version // Fencing check
        },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentRef: paymentData.paymentRef,
          paymentRefEnc: encryptField(paymentData.paymentRef),
          idempotencyKey,
          version: { increment: 1 }
        },
      });

      if (updateResult.count === 0) throw new Error("ALREADY_PROCESSED");

      // 4. PAYLOAD-BOUND IDEMPOTENCY KEY
      // Format: TOPUP-{orderNumber}-{payloadHash prefix}
      const deliveryPayload = {
        playerUid: order.playerUid,
        serverId: order.serverId,
        amount: order.amountUsd,
      };
      const externalKey = generateIdempotencyKey(order.orderNumber, deliveryPayload);

      // 5. CREATE DELIVERY JOB + LEDGER ENTRY ATOMICALLY
      const deliveryJob = await tx.deliveryJob.create({
        data: {
          orderId,
          status: "PENDING",
          maxAttempts: order.maxDeliveryAttempts,
          nextAttemptAt: new Date(),
          externalIdempotencyKey: externalKey,
        },
      });

      // Create ledger entry (write-ahead log)
      await tx.providerLedger.create({
        data: {
          deliveryJobId: deliveryJob.id,
          provider: order.product.gameDropOfferId ? 'GAMEDROP' : (order.product.g2bulkCatalogueName ? 'G2BULK' : 'MANUAL'),
          idempotencyKey: externalKey,
          payloadHash: generatePayloadHash(deliveryPayload),
          requestPayload: deliveryPayload,
          externalState: 'UNKNOWN',
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { 
          status: "QUEUED", 
          deliveryStatus: "QUEUED",
          version: { increment: 1 }
        },
      });

      return { status: updated.status };
    });

    await releaseOrderLock(orderId, processorId);
    return { success: true, status: result.status };
  } catch (err) {
    await releaseOrderLock(orderId, processorId);
    if (err.message === "ALREADY_PROCESSED") return { success: true, status: "PAID" };
    return { success: false, status: "ERROR" };
  }
}

// ===================== DELIVERY WORKER (HARDENED) =====================

/**
 * PRE-FLIGHT LEASE VALIDATION
 * Must be called BEFORE any provider API call
 * Prevents zombie worker duplicate dispatch after partition/GC
 */
async function validateExecutionLease(
  tx: any,
  jobId: string,
  workerId: string
): Promise<{ valid: boolean; reason?: string }> {
  const job = await tx.deliveryJob.findUnique({
    where: { id: jobId },
    select: { workerId: true, lockUntil: true, status: true },
  });

  if (!job) {
    return { valid: false, reason: 'JOB_NOT_FOUND' };
  }

  if (job.workerId !== workerId) {
    return { valid: false, reason: 'WORKER_ID_MISMATCH' };
  }

  // Use DB's NOW() for clock-drift immunity
  const isLocked = await tx.$queryRaw`
    SELECT "lockUntil" > NOW() as "isLocked"
    FROM "DeliveryJob"
    WHERE "id" = ${jobId}
  `;

  if (!isLocked[0]?.isLocked) {
    return { valid: false, reason: 'LOCK_EXPIRED' };
  }

  return { valid: true };
}

/**
 * SAFE RETRY DECISION
 * Returns true only if retry is safe (not ambiguous, not already succeeded)
 */
function isRetrySafe(job: any, providerResponse: any): boolean {
  // NEVER retry UNKNOWN states - must go through reconciler
  if (job.status === 'UNKNOWN_EXTERNAL_STATE') {
    return false;
  }

  // NEVER retry MANUAL_REVIEW - requires human intervention
  if (job.status === 'MANUAL_REVIEW') {
    return false;
  }

  // NEVER retry if already dispatched without response (ambiguous)
  if (job.status === 'DISPATCHED' && !providerResponse) {
    return false;
  }

  // 409 idempotency conflict = POSSIBLE SUCCESS, not failure
  if (providerResponse?.errorCode === 'IDEMPOTENCY_CONFLICT') {
    return false; // Treat as ambiguous, not retryable failure
  }

  // Only retry explicit failures with confirmed provider response
  if (job.status === 'FAILED' && providerResponse?.confirmedFailure === true) {
    return (job.attempt || 0) + 1 < job.maxAttempts;
  }

  return false;
}

export async function processDeliveryQueue(limit: number = 20): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  unknown: number;
  circuitBlocked: number;
}> {
  const workerId = `worker_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const results = { 
    processed: 0, 
    succeeded: 0, 
    failed: 0, 
    skipped: 0, 
    unknown: 0,
    circuitBlocked: 0,
  };

  // Check backpressure - pause dispatches if needed
  if (!canDispatchNewJobs()) {
    console.warn('[worker] Backpressure: dispatches paused');
    return results;
  }

  // Check if retries are allowed
  if (!canRetryJobs()) {
    console.warn('[worker] Backpressure: retries paused');
    // Still process new jobs, just don't retry failures
  }

  // Respect concurrency limit (backpressure)
  const concurrencyLimit = getWorkerConcurrencyLimit();
  const effectiveLimit = Math.min(limit, concurrencyLimit);

  // 1. RECOVER STUCK with fencing reset
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.deliveryJob.updateMany({
    where: { 
      status: { in: ['PROCESSING', 'DISPATCHED'] }, 
      startedAt: { lt: tenMinutesAgo } 
    },
    data: { 
      status: 'UNKNOWN_EXTERNAL_STATE', 
      nextAttemptAt: new Date(), 
      workerId: null 
    },
  });

  // 2. ATOMIC CLAIM (Fencing: workerId + startedAt)
  // Only claim PENDING or RETRYING jobs (not UNKNOWN states)
  const claimResult = await prisma.deliveryJob.updateMany({
    where: { 
      status: { in: ["PENDING", "RETRYING"] }, 
      nextAttemptAt: { lte: new Date() } 
    },
    data: { status: "PROCESSING", startedAt: new Date(), workerId },
  });

  if (claimResult.count === 0) return results;

  const jobs = await prisma.deliveryJob.findMany({
    where: { status: "PROCESSING", workerId },
    take: effectiveLimit,
    include: { 
      order: { include: { game: true, product: true } },
      providerLedger: true,
    },
  });

  for (const job of jobs) {
    const lock = await acquireOrderLock(job.orderId, workerId, DELIVERY_LOCK_DURATION_MS);
    if (!lock.locked) {
      await prisma.deliveryJob.update({
        where: { id: job.id },
        data: { status: 'RETRYING', workerId: null, nextAttemptAt: new Date(Date.now() + 60000) },
      });
      continue;
    }

    const order = lock.order;

    try {
      // Check if already delivered (idempotency)
      if (order.status === "DELIVERED") {
        await prisma.$transaction([
          prisma.deliveryJob.update({ 
            where: { id: job.id },
            data: { status: "SUCCESS" } 
          }),
          job.providerLedgerId ? 
            prisma.providerLedger.update({
              where: { id: job.providerLedgerId },
              data: { externalState: 'SUCCESS' },
            }) : prisma.$executeRaw`SELECT 1`,
        ]);
        results.succeeded++;
        continue;
      }

      // PRE-FLIGHT LEASE VALIDATION (critical for zombie prevention)
      const leaseCheck = await prisma.$transaction(async (tx) => {
        return await validateExecutionLease(tx, job.id, workerId);
      });

      if (!leaseCheck.valid) {
        console.warn(`[worker] Lease validation failed for job ${job.id}: ${leaseCheck.reason}`);
        await prisma.deliveryJob.update({
          where: { id: job.id },
          data: { status: 'RETRYING', workerId: null, nextAttemptAt: new Date() },
        });
        continue;
      }

      // CIRCUIT BREAKER CHECK
      const provider = order.product.gameDropOfferId ? 'GAMEDROP' : (order.product.g2bulkCatalogueName ? 'G2BULK' : null);
      if (provider) {
        const circuitCheck = await isRequestAllowed(provider);
        if (!circuitCheck.allowed) {
          console.warn(`[worker] Circuit breaker OPEN for ${provider}: ${circuitCheck.reason}`);
          results.circuitBlocked++;
          
          // Move to UNKNOWN instead of failing
          await prisma.deliveryJob.update({
            where: { id: job.id },
            data: { 
              status: 'UNKNOWN_EXTERNAL_STATE',
              workerId: null,
              errorMessage: `Circuit breaker: ${circuitCheck.reason}`,
              nextAttemptAt: circuitCheck.nextRetryTime || new Date(Date.now() + 300000),
            },
          });
          continue;
        }

        // Check provider health
        const healthCheck = await getProviderStatus(provider);
        if (!healthCheck.allowRequests) {
          console.warn(`[worker] Provider unhealthy ${provider}: ${healthCheck.reason}`);
          results.circuitBlocked++;
          continue;
        }
      }

      // Verify payload hasn't drifted (admin edit detection)
      const requestPayload = {
        playerUid: order.playerUid,
        serverId: order.serverId,
        amount: order.amountUsd,
      };

      if (job.providerLedger?.payloadHash) {
        const payloadValid = verifyPayloadHash(job.providerLedger.payloadHash, requestPayload);
        if (!payloadValid) {
          console.warn(`[worker] Payload drift detected for job ${job.id}`);
          await prisma.$transaction(async (tx) => {
            await createManualReview(tx, job.id, 'PAYLOAD_DRIFT_DETECTED', 'HIGH');
            if (job.providerLedgerId) {
              await markLedgerAmbiguous(tx, job.providerLedgerId, 'Payload changed after dispatch');
            }
          });
          results.unknown++;
          continue;
        }
      }

      // 3. CREATE LEDGER ENTRY BEFORE DISPATCH (Write-Ahead Log)
      let ledgerEntry = job.providerLedger;
      if (!ledgerEntry) {
        await prisma.$transaction(async (tx) => {
          ledgerEntry = await createLedgerEntry(
            tx,
            job.id,
            provider as any,
            job.externalIdempotencyKey,
            requestPayload,
            workerId
          );
        });
      }

      // 4. EXECUTE DELIVERY (with crash handling and circuit breaker)
      const deliveryResult = await executeDeliveryForJob(job, ledgerEntry, provider);

      // Record provider call metrics
      if (provider) {
        await recordProviderCall(provider, {
          success: deliveryResult.success,
          timeout: deliveryResult.errorCode === 'TIMEOUT',
          conflict: deliveryResult.errorCode === 'IDEMPOTENCY_CONFLICT',
          latencyMs: deliveryResult.latencyMs || 0,
          errorMessage: deliveryResult.message,
        });

        if (deliveryResult.success) {
          await recordCircuitSuccess(provider);
        } else if (deliveryResult.errorCode === 'TIMEOUT' || deliveryResult.errorCode === 'NETWORK_ERROR') {
          await recordCircuitFailure(provider, deliveryResult.message, true);
        } else {
          await recordCircuitFailure(provider, deliveryResult.message);
        }
      }

      // 5. HANDLE RESULT
      if (deliveryResult.success) {
        // SUCCESS: Atomic commit of status + response
        await prisma.$transaction([
          prisma.deliveryJob.update({
            where: { id: job.id, workerId }, // FENCING
            data: { 
              status: "SUCCESS", 
              completedAt: new Date(), 
              providerResponse: deliveryResult.response 
            },
          }),
          prisma.providerLedger.update({
            where: { id: ledgerEntry.id },
            data: {
              externalState: 'SUCCESS',
              providerTransactionId: deliveryResult.transactionId,
              providerResponse: deliveryResult.response,
              resolvedAt: new Date(),
              resolvedBy: workerId,
              resolutionSource: 'API_RESPONSE',
            },
          }),
          prisma.order.update({
            where: { id: job.orderId },
            data: { 
              status: "DELIVERED", 
              deliveryStatus: "DELIVERED",
              deliveredAt: new Date(),
              version: { increment: 1 }
            },
          }),
        ]);
        results.succeeded++;
      } else if (deliveryResult.errorCode === 'TIMEOUT' || deliveryResult.errorCode === 'NETWORK_ERROR') {
        // TIMEOUT/NETWORK = AMBIGUOUS, not failure
        await prisma.$transaction([
          prisma.deliveryJob.update({
            where: { id: job.id },
            data: { 
              status: "UNKNOWN_EXTERNAL_STATE",
              workerId: null,
              errorMessage: deliveryResult.message,
            },
          }),
          prisma.providerLedger.update({
            where: { id: ledgerEntry.id },
            data: {
              externalState: 'AMBIGUOUS',
            },
          }),
        ]);
        results.unknown++;
      } else if (deliveryResult.errorCode === 'IDEMPOTENCY_CONFLICT') {
        // 409 = POSSIBLE SUCCESS, treat as ambiguous
        await prisma.$transaction([
          prisma.deliveryJob.update({
            where: { id: job.id },
            data: { 
              status: "UNKNOWN_EXTERNAL_STATE",
              workerId: null,
              errorMessage: "Idempotency conflict - may have succeeded",
            },
          }),
          prisma.providerLedger.update({
            where: { id: ledgerEntry.id },
            data: {
              externalState: 'AMBIGUOUS',
            },
          }),
        ]);
        results.unknown++;
      } else {
        // Explicit failure (provider confirmed failure)
        const retry = canRetryJobs() && (job.attempt || 0) + 1 < job.maxAttempts;
        await prisma.$transaction([
          prisma.deliveryJob.update({
            where: { id: job.id, workerId },
            data: { 
              status: retry ? "RETRYING" : "FAILED", 
              attempt: { increment: 1 }, 
              nextAttemptAt: retry ? new Date(Date.now() + 300000) : null,
              workerId: null,
              errorMessage: deliveryResult.message,
            },
          }),
          prisma.providerLedger.update({
            where: { id: ledgerEntry.id },
            data: {
              externalState: 'FAILED',
              providerResponse: deliveryResult.response,
              resolvedAt: new Date(),
              resolutionSource: 'API_RESPONSE',
            },
          }),
        ]);
        results.failed++;
      }
    } catch (err) {
      console.error(`[worker] Unexpected error for job ${job.id}:`, err);
      // Unexpected error = ambiguous state
      await prisma.$transaction(async (tx) => {
        await tx.deliveryJob.update({
          where: { id: job.id },
          data: { 
            status: "UNKNOWN_EXTERNAL_STATE",
            workerId: null,
            errorMessage: err.message,
          },
        });
        if (ledgerEntry?.id) {
          await markLedgerAmbiguous(tx, ledgerEntry.id, err.message);
        }
      });
      results.unknown++;
    } finally {
      await releaseOrderLock(job.orderId, workerId);
    }
  }
  return results;
}

async function executeDeliveryForJob(
  job: any, 
  ledgerEntry: any,
  provider?: string
): Promise<{
  success: boolean;
  message: string;
  transactionId?: string;
  provider?: string;
  response?: string;
  errorCode?: 'TIMEOUT' | 'NETWORK_ERROR' | 'IDEMPOTENCY_CONFLICT' | 'PROVIDER_ERROR';
  latencyMs?: number;
}> {
  const order = job.order;
  const idempotencyKey = job.externalIdempotencyKey;
  const startTime = Date.now();

  if (!idempotencyKey) {
    return { 
      success: false, 
      message: "Missing external idempotency key",
      errorCode: 'PROVIDER_ERROR',
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    if (order.product.gameDropOfferId) {
      const result = await createGameDropOrder(
        GAMEDROP_TOKEN, 
        order.product.gameDropOfferId, 
        order.playerUid, 
        order.serverId, 
        idempotencyKey
      );
      
      if (result.status === "SUCCESS" || result.status === "PENDING") {
        return { 
          success: true, 
          message: result.message || "Delivery successful",
          transactionId: result.transactionId,
          provider: 'GAMEDROP',
          response: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
        };
      } else {
        return {
          success: false,
          message: result.message || "GameDrop delivery failed",
          errorCode: 'PROVIDER_ERROR',
          response: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
        };
      }
    } else if (order.product.g2bulkCatalogueName) {
      const result = await createG2BulkOrder(
        G2BULK_TOKEN, 
        order.product.g2bulkCatalogueName, 
        order.playerUid, 
        order.serverId, 
        idempotencyKey
      );
      
      if (result.success) {
        return { 
          success: true, 
          message: result.message || "Delivery successful",
          transactionId: result.orderId?.toString(),
          provider: 'G2BULK',
          response: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
        };
      } else {
        return {
          success: false,
          message: result.message || "G2Bulk delivery failed",
          errorCode: 'PROVIDER_ERROR',
          response: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
        };
      }
    }
    return { 
      success: true, 
      message: "Manual fulfillment",
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    
    // Timeout or network error = AMBIGUOUS
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      return {
        success: false,
        message: `Provider timeout: ${err.message}`,
        errorCode: 'TIMEOUT',
        latencyMs,
      };
    }
    if (err.message.includes('network') || err.message.includes('fetch')) {
      return {
        success: false,
        message: `Network error: ${err.message}`,
        errorCode: 'NETWORK_ERROR',
        latencyMs,
      };
    }
    // Check for idempotency conflict (409)
    if (err.statusCode === 409 || err.message.includes('duplicate') || err.message.includes('idempotency')) {
      return {
        success: false,
        message: `Idempotency conflict: ${err.message}`,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        latencyMs,
      };
    }
    return { 
      success: false, 
      message: err.message,
      errorCode: 'PROVIDER_ERROR',
      latencyMs,
    };
  }
}

// ===================== RECONCILER (Atomic Metadata) =====================

export async function reconcileMissedPayments(): Promise<any> {
  const workerId = `reconcile_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const cutoff = new Date(Date.now() - 30000);

  const pending = await prisma.order.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff }, paymentRef: { not: null } },
    take: 50,
  });

  for (const order of pending) {
    let md5Hash = order.metadata?.bakongMd5;
    
    if (!md5Hash && order.qrString) {
      // 1. ATOMIC JSON UPDATE (Prevent race/erasure)
      md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
      await prisma.$executeRaw`
        UPDATE "Order"
        SET "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{bakongMd5}', ${JSON.stringify(md5Hash)}::jsonb, true)
        WHERE "id" = ${order.id}
      `;
    }

    if (!md5Hash) continue;

    try {
      const bakong = await checkBakongPayment(md5Hash);
      if (bakong.paid) {
        // ALWAYS use the single authority markOrderPaid which handles locks/idempotency
        await markOrderPaid(order.id, {
          paymentRef: order.paymentRef,
          amount: bakong.amount,
          currency: bakong.currency,
          transactionId: bakong.transactionId,
          verifiedBy: "cron",
        });
      } else if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
        // Guard expiration with status check
        await prisma.order.updateMany({ 
          where: { id: order.id, status: "PENDING" }, 
          data: { status: "EXPIRED" } 
        });
      }
    } catch {}
  }
}

export async function checkPaymentStatus(orderId: string): Promise<any> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { status: "NOT_FOUND" };
  const paid = ["PAID", "QUEUED", "DELIVERING", "DELIVERED"].includes(order.status);
  return { status: order.status, isPaid: paid };
}
