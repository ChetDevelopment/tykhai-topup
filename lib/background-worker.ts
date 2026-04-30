/**
 * Background Worker System for Ty Khai TopUp
 * Handles: Payment re-checking, expired order cleanup, delivery retry, fraud detection
 * Uses: Node.js cron + Prisma (for single-server). Use BullMQ/Redis for multi-server.
 */

import { prisma } from "./prisma";
import { checkBakongPayment, validatePaymentAmount } from "./payment";
import { processSuccessfulPayment } from "./payment";
import { logSecurityEvent } from "./security";
import { decryptField } from "./encryption";
import { notifyTelegram } from "./telegram";
import { checkGameDropBalance } from "./gamedrop";
import { pauseSystem, resumeSystem, sendBalanceAlert } from "./system-control";

// ===================== Configuration =====================
const WORKER_CONFIG = {
  paymentCheckIntervalMs: 5 * 60 * 1000,  // Check pending payments every 5 min
  expireCheckIntervalMs: 15 * 60 * 1000, // Check expired orders every 15 min
  deliveryRetryIntervalMs: 10 * 60 * 1000, // Retry failed deliveries every 10 min
  fraudCheckIntervalMs: 30 * 60 * 1000, // Run fraud checks every 30 min
  balanceCheckIntervalMs: 5 * 60 * 1000, // Check GameDrop balance every 5 min
  reservationCleanupIntervalMs: 15 * 60 * 1000, // Cleanup expired reservations
  batchSize: 50,
  maxDeliveryAttempts: 3,
  deliveryRetryDelays: [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000],
};

// ===================== Worker State =====================
let isRunning = false;
let intervals: NodeJS.Timeout[] = [];

// ===================== Main Worker Loop =====================
export async function startBackgroundWorker() {
  console.log("[worker] Starting background worker...");

  // Job 1: Check pending payments
  const paymentInterval = setInterval(async () => {
    if (isRunning) return; // Prevent overlap
    isRunning = true;
    try {
      await checkPendingPayments();
    } catch (err) {
      console.error("[worker] Payment check error:", err);
    } finally {
      isRunning = false;
    }
  }, WORKER_CONFIG.paymentCheckIntervalMs);

  // Job 2: Expire old pending orders
  const expireInterval = setInterval(async () => {
    try {
      await expireOldPendingOrders();
    } catch (err) {
      console.error("[worker] Expire check error:", err);
    }
  }, WORKER_CONFIG.expireCheckIntervalMs);

  // Job 3: Retry failed deliveries
  const deliveryInterval = setInterval(async () => {
    try {
      await retryFailedDeliveries();
    } catch (err) {
      console.error("[worker] Delivery retry error:", err);
    }
  }, WORKER_CONFIG.deliveryRetryIntervalMs);

  // Job 4: Fraud detection
  const fraudInterval = setInterval(async () => {
    try {
      await runFraudDetection();
    } catch (err) {
      console.error("[worker] Fraud detection error:", err);
    }
  }, WORKER_CONFIG.fraudCheckIntervalMs);

  // Job 5: Balance check
  const balanceInterval = setInterval(async () => {
    try {
      await runBalanceCheck();
    } catch (err) {
      console.error("[worker] Balance check error:", err);
    }
  }, WORKER_CONFIG.balanceCheckIntervalMs || 5 * 60 * 1000);

  // Job 6: Reservation cleanup
  const reservationInterval = setInterval(async () => {
    try {
      await expireReservations();
    } catch (err) {
      console.error("[worker] Reservation cleanup error:", err);
    }
  }, WORKER_CONFIG.reservationCleanupIntervalMs || 15 * 60 * 1000);

  intervals = [paymentInterval, expireInterval, deliveryInterval, fraudInterval, balanceInterval, reservationInterval];

  console.log("[worker] All jobs scheduled successfully");
}

export async function stopBackgroundWorker() {
  console.log("[worker] Stopping background worker...");
  intervals.forEach(clearInterval);
  intervals = [];
}

// ===================== Job 1: Check Pending Payments =====================
async function checkPendingPayments() {
  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentRef: { not: null },
      NOT: [
        { paymentRef: { startsWith: "SIM-" } },
        { paymentRef: { startsWith: "WALLET-" } },
      ],
    },
    take: WORKER_CONFIG.batchSize,
    orderBy: { createdAt: "asc" }, // Oldest first
    include: { game: true, product: true },
  });

  if (orders.length === 0) return;

  console.log(`[worker] Checking ${orders.length} pending payments...`);

  for (const order of orders) {
    try {
      // Skip if expired
      if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
        await handleExpiredPayment(order);
        continue;
      }

      // Check payment status
      const paymentRef = order.paymentRef!;
      const result = await checkBakongPayment(paymentRef);

      if (!result) continue; // No update yet

      if (result.paid) {
        // Payment verified - validate amount
        const { valid } = validatePaymentAmount(
          order.amountUsd,
          order.currency,
          result.amount ? parseFloat(String(result.amount)) : 0,
          order.currency === "KHR" ? undefined : 4100
        );

        if (!valid) {
          await handleAmountMismatch(order, result);
          continue;
        }

        // Payment valid - process
        await logPaymentEvent(order.id, "VERIFIED", {
          paymentRef,
          amount: result.amount,
          currency: result.currency,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            paymentRef: result.transactionId || paymentRef,
          },
        });

        // Trigger delivery
        await scheduleDelivery(order.id);
      } else if (String(result.status) === "UNPAID" || String(result.status) === "expired") {
        // Payment not completed
        await logPaymentEvent(order.id, "STILL_PENDING", {
          paymentRef,
          status: result.status,
        });
      }
    } catch (err) {
      console.error(`[worker] Error checking order ${order.orderNumber}:`, err);
      await logPaymentEvent(order.id, "CHECK_ERROR", {
        error: String(err),
      });
    }
  }
}

// ===================== Job 2: Expire Old Pending Orders =====================
async function expireOldPendingOrders() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      OR: [
        { paymentExpiresAt: { lt: new Date() } },
        { paymentExpiresAt: null, createdAt: { lt: cutoff } },
      ],
    },
    take: WORKER_CONFIG.batchSize,
  });

  if (expiredOrders.length === 0) return;

  console.log(`[worker] Expiring ${expiredOrders.length} old pending orders...`);

  for (const order of expiredOrders) {
    try {
      await handleExpiredPayment(order);
    } catch (err) {
      console.error(`[worker] Error expiring order ${order.orderNumber}:`, err);
    }
  }
}

async function handleAmountMismatch(
  order: { id: string; orderNumber: string },
  result: { amount?: string | number; currency?: string; expected?: number }
) {
  await logPaymentEvent(order.id, "AMOUNT_MISMATCH", {
    orderNumber: order.orderNumber,
    expectedAmount: result.expected,
    paidAmount: result.amount ? parseFloat(String(result.amount)) : undefined,
    currency: result.currency,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "FAILED", failureReason: "Payment amount mismatch" },
  });
}

async function handleExpiredPayment(order: { id: string; orderNumber: string; paymentMethod: string }) {
  const newStatus = order.paymentMethod === "WALLET" ? "FAILED" : "CANCELLED";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      failureReason: "Payment expired",
    },
  });

  await logPaymentEvent(order.id, "EXPIRED", {
    previousStatus: "PENDING",
    newStatus,
  });

  // Release wallet reservation if applicable
  await releaseWalletReservation(order.id);
}

// ===================== Job 3: Retry Failed Deliveries =====================
async function retryFailedDeliveries() {
  const now = new Date();

  const orders = await prisma.order.findMany({
    where: {
      status: "PROCESSING",
      deliveryAttempts: { lt: WORKER_CONFIG.maxDeliveryAttempts },
      OR: [
        { nextDeliveryAt: { lte: now } },
        { nextDeliveryAt: null, lastDeliveryAt: { lt: new Date(now.getTime() - 300000) } }, // 5 min ago
      ],
    },
    take: WORKER_CONFIG.batchSize,
    include: { game: true, product: true },
  });

  if (orders.length === 0) return;

  console.log(`[worker] Retrying ${orders.length} failed deliveries...`);

  for (const order of orders) {
    try {
      const nextAttempt = (order.deliveryAttempts || 0) + 1;

      await logDeliveryEvent(order.id, nextAttempt, "RETRY", {
        previousAttempts: order.deliveryAttempts,
      });

      // Call delivery function
      const result = await deliverOrder(order);

      if (result.success) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            deliveryAttempts: nextAttempt,
          },
        });

        await logDeliveryEvent(order.id, nextAttempt, "SUCCESS", {
          durationMs: result.durationMs,
        });
      } else {
        // Failed again
        const nextRetryDelay = WORKER_CONFIG.deliveryRetryDelays[nextAttempt - 1] || 30 * 60 * 1000;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            deliveryAttempts: nextAttempt,
            lastDeliveryAt: new Date(),
            nextDeliveryAt: new Date(Date.now() + nextRetryDelay),
          },
        });

        await logDeliveryEvent(order.id, nextAttempt, "FAILED", {
          error: result.error,
          nextRetryAt: new Date(Date.now() + nextRetryDelay).toISOString(),
        });

        // If max attempts reached, require refund
        if (nextAttempt >= WORKER_CONFIG.maxDeliveryAttempts) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "REFUND_REQUIRED" },
          });

          await logPaymentEvent(order.id, "MAX_DELIVERY_ATTEMPTS", {
            attempts: nextAttempt,
            action: "REQUIRES_REFUND",
          });

          // Notify admin
          await notifyTelegram(
            `⚠️ <b>Refund Required</b>\n` +
              `Order #${order.orderNumber} failed delivery after ${nextAttempt} attempts.\n` +
              `Action required: Process refund manually.`
          );
        }
      }
    } catch (err) {
      console.error(`[worker] Delivery retry error for ${order.orderNumber}:`, err);
    }
  }
}

// ===================== Job 4: Fraud Detection =====================
async function runFraudDetection() {
  console.log("[worker] Running fraud detection...");

  // Rule 1: High-frequency orders from same IP/email
  const recentOrders = await prisma.order.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
    select: { id: true, customerEmail: true, ipAddress: true, playerUid: true, amountUsd: true },
  });

  const emailCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const uidCounts = new Map<string, number>();
  const amountCounts = new Map<number, number>();

  for (const order of recentOrders) {
    if (order.customerEmail) {
      const email = decryptField(order.customerEmail) || order.customerEmail;
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    }
    if (order.ipAddress) {
      const ip = decryptField(order.ipAddress) || order.ipAddress;
      ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    }
    uidCounts.set(order.playerUid, (uidCounts.get(order.playerUid) || 0) + 1);
    amountCounts.set(order.amountUsd, (amountCounts.get(order.amountUsd) || 0) + 1);
  }

  // Flag high-frequency
  for (const [email, count] of emailCounts) {
    if (count > 10) { // More than 10 orders/hour
      await flagFraud({
        type: "HIGH_FREQUENCY",
        severity: "HIGH",
        description: `Email ${email} has ${count} orders in the last hour`,
        metadata: { email, count, timeWindow: "1 hour" },
      });
    }
  }

  for (const [ip, count] of ipCounts) {
    if (count > 15) { // More than 15 orders/hour from same IP
      await flagFraud({
        type: "HIGH_FREQUENCY_IP",
        severity: "HIGH",
        description: `IP ${ip} has ${count} orders in the last hour`,
        metadata: { ip, count, timeWindow: "1 hour" },
      });
    }
  }

  // Flag same UID across multiple accounts
  for (const [uid, count] of uidCounts) {
    if (count > 5) { // Same UID used 5+ times in an hour
      await flagFraud({
        type: "SAME_UID_MULTI",
        severity: "MEDIUM",
        description: `UID ${uid} used in ${count} orders in the last hour`,
        metadata: { uid, count, timeWindow: "1 hour" },
      });
    }
  }

  // Flag abnormal amounts (e.g., very high amount)
  for (const [amount, count] of amountCounts) {
    if (amount > 100 && count > 3) { // High-value orders
      await flagFraud({
        type: "ABNORMAL_AMOUNT",
        severity: "MEDIUM",
        description: `High-value amount $${amount} appears ${count} times in 1 hour`,
        metadata: { amount, count, timeWindow: "1 hour" },
      });
    }
  }
}

// ===================== Helper Functions =====================
async function flagFraud(params: {
  type: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  orderId?: string;
  userId?: string;
}) {
  // Check if already flagged recently
  const recentFlag = await prisma.fraudFlag.findFirst({
    where: {
      type: params.type,
      isResolved: false,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      ...(params.orderId ? { orderId: params.orderId } : {}),
    },
  });

  if (recentFlag) return; // Already flagged

  await prisma.fraudFlag.create({
    data: {
      type: params.type,
      severity: params.severity,
      description: params.description,
      metadata: JSON.stringify(params.metadata),
      orderId: params.orderId,
      userId: params.userId,
    },
  });

  // Notify admin for critical issues
  if (params.severity === "HIGH" || params.severity === "CRITICAL") {
    await notifyTelegram(
      `🚨 <b>Fraud Alert</b>\n` +
        `Type: ${params.type}\n` +
        `Severity: ${params.severity}\n` +
        `Description: ${params.description}`
    );
  }
}

async function scheduleDelivery(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "PROCESSING",
      lastDeliveryAt: new Date(),
      nextDeliveryAt: new Date(), // Immediate
    },
  });
}

async function releaseWalletReservation(orderId: string) {
  const reservation = await prisma.walletReservation.findFirst({
    where: { orderId },
  });

  if (reservation && reservation.status === "ACTIVE") {
    await prisma.walletReservation.update({
      where: { id: reservation.id },
      data: { status: "EXPIRED" },
    });

    // Refund to wallet if deducted
    if (reservation.userId && reservation.amount > 0) {
      await prisma.user.update({
        where: { id: reservation.userId },
        data: { walletBalance: { increment: reservation.amount } },
      });
    }
  }
}

// ===================== Delivery Function (Idempotent + Fail-Safe) =====================
async function deliverOrder(order: {
  id: string;
  orderNumber: string;
  game: { slug: string; name: string };
  product: { name: string; amount: number };
  playerUid: string;
  serverId?: string | null;
}): Promise<{ success: boolean; error?: string; durationMs?: number }> {
  const startTime = Date.now();

  try {
    // Check if already delivered (idempotent)
    const existingOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true, deliveredAt: true },
    });

    if (existingOrder?.status === "DELIVERED") {
      return { success: true, durationMs: 0 };
    }

    // Get settings for GameDrop token
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings?.gameDropToken) {
      throw new Error("GameDrop token not configured");
    }

    // Get product's GameDrop offer ID (you need to store this in Product model)
    const product = await prisma.product.findUnique({
      where: { id: order.product.id },
      select: { id: true, name: true },
    });

    // TODO: You need to add `gameDropOfferId` field to Product model
    // For now, using a mapping (you should store this in DB)
    const offerIdMap: Record<string, number> = {
      // Map your product IDs to GameDrop offer IDs
      // "product-uuid-here": 1001, // example
    };

    const offerId = offerIdMap[order.product.id];
    if (!offerId) {
      throw new Error(`No GameDrop offer ID mapped for product: ${order.product.name}`);
    }

    // Import GameDrop functions
    const { createGameDropOrder, validatePlayerId } = await import("./gamedrop");

    // Validate player ID with GameDrop first (optional but recommended)
    console.log(`[delivery] Validating player ID: ${order.playerUid}`);
    const validation = await validatePlayerId(
      settings.gameDropToken,
      offerId,
      order.playerUid,
      order.serverId || undefined
    );

    if (!validation.valid) {
      throw new Error(`Player ID validation failed: ${validation.message}`);
    }

    console.log(`[delivery] Creating GameDrop order for ${order.orderNumber}`);
    
    // This is how GameDrop gets the player UID and delivers to their account
    const result = await createGameDropOrder(
      settings.gameDropToken,
      offerId,
      order.playerUid,  // ← GameDrop uses this as "gameUserId"
      order.serverId || undefined,
      order.orderNumber, // ← Idempotency key (prevents duplicate delivery)
      undefined // customerEmail (optional)
    );

    if (result.status !== "COMPLETED" && result.status !== "PENDING") {
      throw new Error(`GameDrop delivery failed: ${result.message}`);
    }

    const durationMs = Date.now() - startTime;

    console.log(`[delivery] Order ${order.orderNumber} delivered successfully`, {
      status: result.status,
      transactionId: result.transactionId,
    });

    return { success: true, durationMs };
  } catch (err) {
    // Log error but don't throw - let retry logic handle it
    console.error(`[delivery] Order ${order.orderNumber} failed:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown delivery error",
    };
  }
}

    // TODO: Replace with actual game top-up API
    // CRITICAL: This must be idempotent - safe to retry
    // Example:
    // const result = await callGameApi({
    //   gameSlug: order.game.slug,
    //   playerUid: order.playerUid,
    //   serverId: order.serverId,
    //   amount: order.product.amount,
    //   orderNumber: order.orderNumber,
    //   idempotencyKey: order.orderNumber, // API should respect this
    // });

    // Simulate API call (remove in production)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const durationMs = Date.now() - startTime;

    return { success: true, durationMs };
  } catch (err) {
    // Log error but don't throw - let retry logic handle it
    console.error(`[delivery] Order ${order.orderNumber} failed:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown delivery error",
    };
  }
}

// ===================== Logging Helpers =====================
async function logPaymentEvent(
  orderId: string,
  event: string,
  details: Record<string, unknown>
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, paymentRef: true, status: true },
    });

    await prisma.paymentLog.create({
      data: {
        orderId,
        event,
        status: order?.status || "UNKNOWN",
        paymentRef: order?.paymentRef,
        metadata: JSON.stringify(details),
      },
    });
  } catch (err) {
    console.error("[worker] Failed to log payment event:", err);
  }
}

async function logDeliveryEvent(
  orderId: string,
  attemptNumber: number,
  status: string,
  details: Record<string, unknown>
) {
  try {
    await prisma.deliveryLog.create({
      data: {
        orderId,
        attemptNumber,
        status,
        requestPayload: details ? JSON.stringify(details) : undefined,
      },
    });
  } catch (err) {
    console.error("[worker] Failed to log delivery event:", err);
  }
}

// ===================== Job 5: Balance Check =====================
async function runBalanceCheck() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.gameDropToken || settings.systemMode === "FORCE_CLOSE") return;

  try {
    const data = await checkGameDropBalance(settings.gameDropToken);
    const available = data.balance - data.draftBalance;

    // Update latest balance
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        currentBalance: data.balance,
        lastBalanceCheck: new Date(),
        gameDropPartnerId: data.partnerId,
      },
    });

    // Log to BalanceLog
    await prisma.balanceLog.create({
      data: {
        balance: data.balance,
        reserved: data.draftBalance,
        available,
        source: "API",
      },
    });

    // AUTO mode actions only
    if (settings.systemMode === "AUTO") {
      if (settings.criticalThreshold && available < settings.criticalThreshold) {
        await pauseSystem("LOW_BALANCE", available);
      } else if (settings.warningThreshold && available < settings.warningThreshold) {
        await sendBalanceAlert("WARNING", available, settings.warningThreshold);
      } else if (settings.systemStatus === "PAUSED" && settings.pauseReason === "LOW_BALANCE") {
        await resumeSystem("Balance restored above critical threshold");
      }
    }
  } catch (err) {
    console.error("[worker] GameDrop check failed:", err);
    if (settings?.systemMode === "AUTO") {
      await pauseSystem("API_ERROR");
    }
  }
}

// ===================== Job 6: Reservation Cleanup =====================
async function expireReservations() {
  const expired = await prisma.walletReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
  });

  for (const res of expired) {
    await prisma.walletReservation.update({
      where: { id: res.id },
      data: { status: "EXPIRED" },
    });
    await prisma.settings.update({
      where: { id: 1 },
      data: { reservedBalance: { decrement: res.amount } },
    });
  }
}

// ===================== Worker Health Check =====================
export async function getWorkerStatus() {
  return {
    isRunning,
    jobs: {
      paymentCheck: { intervalMs: WORKER_CONFIG.paymentCheckIntervalMs },
      expireCheck: { intervalMs: WORKER_CONFIG.expireCheckIntervalMs },
      deliveryRetry: { intervalMs: WORKER_CONFIG.deliveryRetryIntervalMs },
      fraudCheck: { intervalMs: WORKER_CONFIG.fraudCheckIntervalMs },
      balanceCheck: { intervalMs: WORKER_CONFIG.balanceCheckIntervalMs },
      reservationCleanup: { intervalMs: WORKER_CONFIG.reservationCleanupIntervalMs },
    },
    config: WORKER_CONFIG,
  };
}
