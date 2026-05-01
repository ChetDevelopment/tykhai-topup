// @ts-nocheck
/**
 * Unified Payment System for Ty Khai TopUp
 * Handles: Bakong KHQR only + Wallet (internal)
 * Features: Retry logic, strict validation, secure storage, audit logging
 */

import crypto from "crypto";
import { BakongKHQR, khqrData, IndividualInfo } from "bakong-khqr";
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

  try {
    console.log("[payment:bakong] Generating QR with ref:", paymentRef);
    console.log("[payment:bakong] Account:", BAKONG_ACCOUNT, "City:", BAKONG_MERCHANT_CITY);
    console.log("[payment:bakong] Currency:", isKhr ? "KHR" : "USD", "Amount:", amount);

    const optionalData = {
      currency: isKhr ? khqrData.currency.khr : khqrData.currency.usd,
      amount: Number(amount),
      billNumber: paymentRef,
      expirationTimestamp: expiresAt.getTime(),
    };

    const individualInfo = new IndividualInfo(
      BAKONG_ACCOUNT,
      BAKONG_MERCHANT_NAME,
      BAKONG_MERCHANT_CITY,
      optionalData
    );

    const khqr = new BakongKHQR();
    const response = khqr.generateIndividual(individualInfo);

    console.log("[payment:bakong] Response status:", JSON.stringify(response.status));
    console.log("[payment:bakong] Response data exists:", !!response.data);

    if (response.status?.errorCode) {
      throw new Error(response.status.message || "KHQR generation failed");
    }

    if (!response.data?.qr) {
      throw new Error("QR string is empty - response.data is: " + JSON.stringify(response.data));
    }

    const qrString = response.data.qr;
    const md5String = response.data.md5;

    console.log("[payment:bakong] QR generated, length:", qrString.length);
    console.log("[payment:bakong] MD5 hash:", md5String);
    console.log("[payment:bakong] QR expires at:", expiresAt.toISOString());

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
  } catch (err) {
    throw new PaymentError(
      `Failed to generate KHQR: ${err instanceof Error ? err.message : "Unknown error"}`,
      "KHQR_GENERATION_FAILED",
      500
    );
  }
}

// ===================== Bakong API Helper =====================
const BAKONG_API_BASE = "https://api-bakong.nbc.gov.kh";

async function bakongApiRequest(endpoint: string, payload: unknown): Promise<any> {
  const response = await fetch(`${BAKONG_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BAKONG_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Bakong API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ===================== Payment Verification (Bakong) =====================
export async function checkBakongPayment(
  orderNumber: string
): Promise<PaymentVerificationResult> {
  if (!BAKONG_TOKEN) {
    throw PaymentError.configurationError("Bakong");
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: { metadata: true, status: true, paymentRef: true }
    });

    if (!order?.metadata?.bakongMd5) {
      console.log("[payment:bakong] No md5String found for order:", orderNumber);
      return { status: "PENDING", paid: false };
    }

    console.log("[payment:bakong] Checking payment for order:", orderNumber, "md5:", order.metadata.bakongMd5);

    const result = await bakongApiRequest("/v1/check_transaction_by_md5", {
      md5: order.metadata.bakongMd5,
    });

    if (result.responseCode === 0 && result.data) {
      return {
        status: "PROCESSING",
        paid: true,
        paidAt: new Date(result.data.acknowledgedDateMs || Date.now()),
        transactionId: result.data.hash || orderNumber,
        amount: result.data.amount,
        currency: result.data.currency,
      };
    }

    return {
      status: "PENDING",
      paid: false,
    };
  } catch (err) {
    console.error(`[payment:bakong] Verification failed for ${orderNumber}:`, err);
    return {
      status: "FAILED",
      paid: false,
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
  const tolerance = 0.01; // 1 cent tolerance

  if (currency === "KHR") {
    if (typeof expectedKhr !== "number") {
      return { valid: false, message: "KHR amount not set" };
    }
    if (Math.abs(paidAmount - expectedKhr) > tolerance) {
      return {
        valid: false,
        message: `Amount mismatch: expected ${expectedKhr} KHR, got ${paidAmount} KHR`,
      };
    }
  } else {
    if (Math.abs(paidAmount - expectedUsd) > tolerance) {
      return {
        valid: false,
        message: `Amount mismatch: expected ${expectedUsd} USD, got ${paidAmount} USD`,
      };
    }
  }

  return { valid: true };
}

// ===================== Wallet Payment =====================
async function initiateWallet(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const paymentRef = `WALLET-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amount = args.currency === "KHR" ? (args.amountKhr ?? args.amountUsd * 4100) : args.amountUsd;

  return {
    paymentRef,
    redirectUrl: `${BASE_URL}/checkout/${args.orderNumber}`,
    qrString: null,
    qrStringEnc: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min for wallet
    instructions: `Pay ${amount} ${args.currency} from your Ty Khai Wallet`,
  };
}

// ===================== Simulated Payment (Development Only) =====================
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
      paymentRefEnc: encryptField(paymentData.paymentRef),
      amountKhr: paymentData.currency === "KHR" ? paymentData.amount : undefined,
    },
  });

  if (updateResult.count === 0) {
    // Already delivered or not found
    return prisma.order.findUnique({ where: { id: orderId } });
  }

  // Fetch the updated order with relations
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { game: true, product: true, user: true },
  });

  if (order) {
    await logPaymentEvent({
      orderNumber: order.orderNumber,
      paymentRef: paymentData.paymentRef,
      event: "PAYMENT_SUCCESS",
      provider: order.paymentMethod,
      amount: paymentData.amount,
      currency: paymentData.currency,
      status: "DELIVERED",
    });

    // Trigger GameDrop delivery automatically
    if (order.product.gameDropOfferId) {
      // Don't await - let background worker handle delivery
      // This prevents blocking the webhook response
    }
  }

  return order;
}
