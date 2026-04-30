// @ts-nocheck
/**
 * Unified Payment System for Ty Khai TopUp
 * Handles: Bakong KHQR, Wallet, TrueMoney, Wing, Bank Transfer, USDT
 * Features: Retry logic, strict validation, secure storage, audit logging
 */

import crypto from "crypto";
import { KHQR } from "bakong-khqr-npm";
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

// ===================== Configuration =====================
const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true";
const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT || "";
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || "";
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || "Phnom Penh";
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || "";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ===================== Retry Logic =====================
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; backoff?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ===================== Core Payment Initiation =====================
export async function initiatePayment(
  args: InitiatePaymentArgs
): Promise<PaymentInitResult> {
  // Validate provider is enabled
  const provider = PAYMENT_PROVIDERS[args.method];
  if (!provider?.enabled) {
    if (SIM_MODE && args.method !== "BAKONG") {
      return initiateSimulatedPayment(args);
    }
    throw PaymentError.configurationError(args.method);
  }

  // Route to appropriate handler
  const handlers: Partial<Record<PaymentMethod, (args: InitiatePaymentArgs) => Promise<PaymentInitResult>>> = {
    BAKONG: initiateBakong,
    TRUE_MONEY: initiateTrueMoney,
    WING: initiateWing,
    BANK: initiateBankTransfer,
    USDT: initiateUsdt,
    WALLET: initiateWallet,
  };

  const handler = handlers[args.method];
  if (!handler) {
    throw new PaymentError(
      `Unsupported payment method: ${args.method}`,
      "UNSUPPORTED_METHOD",
      400
    );
  }

  return handler(args);
}

// ===================== Bakong KHQR (Primary Method) =====================
async function initiateBakong(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  if (!BAKONG_ACCOUNT || !BAKONG_MERCHANT_NAME || !BAKONG_TOKEN) {
    throw PaymentError.configurationError("Bakong");
  }

  const currency = args.currency === "KHR" ? "KHR" : "USD";
  const amount = args.currency === "KHR" ? args.amountKhr : args.amountUsd;

  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    throw new PaymentError("Invalid payment amount", "INVALID_AMOUNT", 400);
  }

  // Validate amount limits
  const provider = PAYMENT_PROVIDERS["BAKONG"];
  if (provider.minAmount && amount < provider.minAmount) {
    throw new PaymentError(
      `Minimum amount is ${provider.minAmount} ${currency}`,
      "AMOUNT_TOO_LOW",
      400
    );
  }

  return withRetry(async () => {
    const khqr = new KHQR(BAKONG_TOKEN, "https://api-bakong.nbc.gov.kh/v1");

    const qrResult = khqr.create_qr({
      bank_account: BAKONG_ACCOUNT,
      merchant_name: BAKONG_MERCHANT_NAME.substring(0, 25),
      merchant_city: BAKONG_MERCHANT_CITY.substring(0, 15),
      amount: Number(amount),
      currency: currency,
      bill_number: args.orderNumber.substring(0, 25),
      terminal_label: "TyKhai",
      static: true, // QR doesn't expire, amount verified server-side
    });

    if (!qrResult || typeof qrResult !== "string" || qrResult.length < 100) {
      throw new Error("Bakong: Invalid QR response");
    }

    // Use SHA256 for secure payment reference
    const paymentRef = hashSha256(qrResult).slice(0, 64);
    const encryptedQr = encryptField(qrResult);

    // Log payment initiation
    await logPaymentEvent({
      orderNumber: args.orderNumber,
      paymentRef,
      event: "INITIATED",
      provider: "BAKONG",
      amount: Number(amount),
      currency,
    });

    return {
      paymentRef,
      redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
      qrString: qrResult, // Return unencrypted for immediate display
      qrStringEnc: encryptedQr, // Encrypted for storage
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      instructions: `Scan the QR code with Bakong app to pay ${amount} ${currency}`,
      deepLink: `bakong://pay?qr=${encodeURIComponent(qrResult)}`,
    };
  });
}

// ===================== Payment Verification =====================
export async function checkBakongPayment(
  paymentRef: string
): Promise<PaymentVerificationResult | null> {
  if (!BAKONG_TOKEN) {
    console.warn("[bakong] No token configured");
    return null;
  }

  // Skip simulation refs
  if (paymentRef.startsWith("SIM-") || paymentRef.startsWith("WALLET-")) {
    return { status: "PENDING", paid: false };
  }

  return withRetry(async () => {
    const khqr = new KHQR(BAKONG_TOKEN, "https://api-bakong.nbc.gov.kh/v1");

    // Convert legacy MD5 to SHA256 if needed
    let refToCheck = paymentRef;
    if (paymentRef.length === 32 && /^[a-f0-9]+$/.test(paymentRef)) {
      refToCheck = hashSha256(paymentRef).slice(0, 64);
    }

    const result = await khqr.get_payment(refToCheck);

    if (!result) {
      return { status: "PENDING", paid: false };
    }

    // Verify receiver account matches our merchant account
    const receiverAccount = result.toAccountId || result.receiverBankAccount || "";
    if (BAKONG_ACCOUNT && receiverAccount && !receiverAccount.includes(BAKONG_ACCOUNT)) {
      console.error(
        `[bakong] Wrong receiver! Expected: ${BAKONG_ACCOUNT}, Got: ${receiverAccount}`
      );
      await logPaymentEvent({
        orderNumber: "UNKNOWN",
        paymentRef,
        event: "WRONG_RECEIVER",
        provider: "BAKONG",
        details: { expected: BAKONG_ACCOUNT, received: receiverAccount },
      });
      return { status: "FAILED", paid: false };
    }

    return {
      status: "PROCESSING",
      paid: true,
      amount: result.amount ? parseFloat(String(result.amount)) : undefined,
      currency: result.currency,
      receiverAccount,
      paidAt: result.acknowledgedDateMs ? new Date(result.acknowledgedDateMs) : new Date(),
      rawResponse: result,
    };
  });
}

// ===================== Strict Amount Validation =====================
export function validatePaymentAmount(
  orderAmountUsd: number,
  orderCurrency: string,
  paidAmount: number,
  orderAmountKhr?: number
): { valid: boolean; expected: number; paid: number; currency: string } {
  if (!paidAmount || isNaN(paidAmount)) {
    return { valid: false, expected: 0, paid: paidAmount, currency: orderCurrency };
  }

  const expected =
    orderCurrency === "KHR"
      ? (orderAmountKhr ?? orderAmountUsd * 4100)
      : orderAmountUsd;

  // Strict check: NO tolerance for KHR (exact match)
  // Very small tolerance for USD (0.01 = 1 cent max difference)
  const tolerance = orderCurrency === "KHR" ? 0 : 0.01;

  const valid = Math.abs(paidAmount - expected) <= tolerance;

  if (!valid) {
    console.error(
      `[payment-validation] Amount mismatch! Paid: ${paidAmount}, Expected: ${expected}, Currency: ${orderCurrency}`
    );
  }

  return { valid, expected, paid: paidAmount, currency: orderCurrency };
}

// ===================== Wallet Payment (Internal) =====================
async function initiateWallet(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const paymentRef = `WALLET-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef,
    redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
    qrString: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    instructions: `Will deduct ${amount} ${args.currency} from your wallet balance`,
  };
}

// ===================== Simulated Payments (Development Only) =====================
function initiateSimulatedPayment(args: InitiatePaymentArgs): PaymentInitResult {
  const ref = `SIM-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=${args.method}`,
    qrString:
      "00020101021252040000530384054041.005802KH5912TYKHAI_TOPUP6008PHNOMPENH62150111TYKHAITOPUP6304ABCD",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    instructions: `[SIMULATION] Pay ${amount} ${args.currency} using ${args.method}`,
  };
}

// ===================== TrueMoney =====================
async function initiateTrueMoney(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const phone = process.env.TRUEMONEY_PHONE;
  if (!phone) throw PaymentError.configurationError("TrueMoney");

  const ref = `TM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=TRUEMONEY`,
    qrString: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Transfer ${amount} ${args.currency} to TrueMoney ${phone}`,
  };
}

// ===================== Wing Money =====================
async function initiateWing(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const wingMsisdn = process.env.WING_MSISDN;
  if (!wingMsisdn) throw PaymentError.configurationError("Wing");

  const ref = `WING-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=WING`,
    qrString: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Transfer ${amount} ${args.currency} to Wing ${wingMsisdn}`,
  };
}

// ===================== Bank Transfer =====================
async function initiateBankTransfer(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const bankName = process.env.BANK_NAME || "ABA Bank";
  const bankAccount = process.env.BANK_ACCOUNT || "123456789";
  const bankAccountName = process.env.BANK_ACCOUNT_NAME || "Ty Khai TopUp";

  const ref = `BANK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=BANK`,
    qrString: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours for bank transfers
    instructions: `Transfer ${amount} ${args.currency} to ${bankName} Account: ${bankAccount} (${bankAccountName}). Reference: ${ref}`,
  };
}

// ===================== USDT (Tether) =====================
async function initiateUsdt(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const usdtWallet = process.env.USDT_WALLET;
  if (!usdtWallet) throw PaymentError.configurationError("USDT");

  const ref = `USDT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  return {
    paymentRef: ref,
    redirectUrl: `${BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=USDT`,
    qrString: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour for crypto
    instructions: `Send exactly ${args.amountUsd} USDT (TRC20) to ${usdtWallet}. Reference: ${ref}`,
  };
}

// ===================== Payment Event Logger =====================
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

// ===================== Process Delivered Order (Idempotent) =====================
export async function processSuccessfulPayment(orderId: string, paymentData: {
  paymentRef: string;
  amount: number;
  currency: string;
  transactionId?: string;
}): Promise<ReturnType<typeof prisma.order.findUnique> | null> {
  // ATOMIC: Use updateMany to prevent race conditions
  // Only update if status is PENDING or PAID (not already DELIVERED)
  const updateResult = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: ["PENDING", "PAID", "PROCESSING"] },
    },
    data: {
      status: "DELIVERED",
      paidAt: new Date(),
      deliveredAt: new Date(),
      paymentRef: paymentData.paymentRef,
      paymentRefEnc: hashSha256(paymentData.paymentRef).slice(0, 64),
    },
  });

  // If no rows affected, order was already processed or doesn't exist
  if (updateResult.count === 0) {
    // Check if already delivered (idempotency)
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { game: true, product: true, user: true },
    });
    return existing;
  }

  // Fetch the updated order with relations
  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: { game: true, product: true, user: true },
  });

  if (!updated) return null;

  // Release wallet reservation if exists (after successful payment)
  const reservation = await prisma.walletReservation.findFirst({
    where: { orderId: updated.id, status: "ACTIVE" },
  });
  if (reservation) {
    await prisma.walletReservation.update({
      where: { id: reservation.id },
      data: { status: "CONSUMED" },
    });
    // Decrement reserved balance in settings atomically
    await prisma.settings.update({
      where: { id: 1 },
      data: { reservedBalance: { decrement: reservation.amount } },
    });
  }

  // Update user total spent (for VIP rank)
  if (updated.userId) {
    const { updateUserTotalSpent } = await import("./auth");
    await updateUserTotalSpent(updated.userId, updated.amountUsd);
  }

  // Send receipt email (async, non-blocking)
  if (updated.customerEmail) {
    const customerEmail = updated.customerEmail; // Already decrypted by API
    if (customerEmail) {
      // Fire and forget - don't block payment processing
      Promise.resolve().then(async () => {
        try {
          const { sendOrderReceipt } = await import("./email");
          await sendOrderReceipt({
            orderNumber: updated.orderNumber,
            gameName: updated.game.name,
            productName: updated.product.name,
            playerUid: updated.playerUid,
            amountUsd: updated.amountUsd,
            amountKhr: updated.amountKhr,
            currency: updated.currency,
            paidAt: updated.paidAt,
            deliveredAt: updated.deliveredAt,
            status: updated.status,
            customerEmail,
          });
        } catch (error) {
          console.error("Failed to send receipt email:", error);
          // Log to database for retry later
          await prisma.paymentLog.create({
            data: {
              orderId: updated.id,
              event: "EMAIL_FAILED",
              status: "ERROR",
              metadata: JSON.stringify({ error: String(error) }),
            },
          }).catch(() => {});
        }
      });
    }
  }

  // Notify via Telegram
  try {
    const { notifyTelegram, escapeHtml } = await import("./telegram");
    await notifyTelegram(
      `💰 <b>Payment Successful</b>\n` +
        `#${escapeHtml(updated.orderNumber)} — ${escapeHtml(updated.game.name)}\n` +
        `UID: <code>${escapeHtml(updated.playerUid)}</code>\n` +
        `Amount: ${updated.currency === "KHR" ? `${Math.round(updated.amountKhr ?? 0).toLocaleString()} ៛` : `$${updated.amountUsd.toFixed(2)}`}`
    );
  } catch {
    // Don't fail if notification fails
  }

  return updated;
}
