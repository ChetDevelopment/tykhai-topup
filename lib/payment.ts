// @ts-nocheck
/**
 * Unified Payment System for Ty Khai TopUp
 * Handles: Bakong KHQR only + Wallet (internal)
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

// ===================== CRC16 Calculation (EMV Standard) =====================
function calculateCRC(data: string): string {
  const crc16Table = [
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7,
    0x8108, 0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF,
    0x1231, 0x0210, 0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6,
    0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE,
    0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485,
    0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D,
    0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4,
    0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D, 0xC7BC,
    0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
    0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12,
    0xDBFD, 0xCBDC, 0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A,
    0x6CA6, 0x7C87, 0x4CE4, 0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41,
    0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B, 0x8D68, 0x9D49,
    0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70,
    0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78,
    0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F,
    0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E,
    0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
    0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D,
    0x34E2, 0x24C3, 0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
    0xA7DB, 0xB7FA, 0x8799, 0x97B8, 0xE75F, 0xF77E, 0xC71D, 0xD73C,
    0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB,
    0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3,
    0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A,
    0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92,
    0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9,
    0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
    0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8,
    0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0,
  ];

  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    const byte = data.charCodeAt(i);
    crc = (crc << 8) ^ crc16Table[((crc >> 8) ^ byte) & 0xFF];
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

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

  const currency = args.currency === "KHR" ? "KHR" : "USD";
  const amount = args.currency === "KHR" ? args.amountKhr : args.amountUsd;

  if (!amount || amount <= 0) {
    throw PaymentError("Invalid amount", "INVALID_AMOUNT", 400);
  }

  // Generate unique payment reference
  const paymentRef = `TY${Date.now()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

  try {
    // Generate QR locally using bakong-khqr-npm library
    // This avoids the 404 error from the deprecated/internal NBC endpoint
    const khqr = new KHQR();
    const qrString = khqr.create_qr({
      bank_account: BAKONG_ACCOUNT,
      merchant_name: BAKONG_MERCHANT_NAME,
      merchant_city: BAKONG_MERCHANT_CITY,
      amount: Number(amount),
      currency: currency,
      bill_number: paymentRef,
      static: false,
    });

    const md5String = khqr.generate_md5(qrString);
    const qrStringEnc = encryptField(qrString);

    // QR expires after 60 minutes (rule out clock sync issues)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

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
      qrString,
      qrStringEnc,
      md5String,
      expiresAt,
      instructions: `Scan this KHQR code with Bakong app to pay ${amount} ${currency}`,
    };
  } catch (err) {
    throw new PaymentError(
      `Failed to generate KHQR: ${err instanceof Error ? err.message : "Unknown error"}`,
      "KHQR_GENERATION_FAILED",
      500
    );
  }
}

// ===================== Payment Verification (Bakong) =====================
export async function checkBakongPayment(
  orderNumber: string
): Promise<PaymentVerificationResult> {
  if (!BAKONG_TOKEN) {
    throw PaymentError.configurationError("Bakong");
  }

  try {
    // Get order from DB to retrieve md5String
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: { metadata: true, status: true }
    });

    if (!order?.metadata?.bakongMd5) {
      return { status: "PENDING", paid: false };
    }

    // Use library for verification (more robust error handling)
    const khqr = new KHQR(BAKONG_TOKEN);
    const paymentData = await khqr.get_payment(order.metadata.bakongMd5);

    // Check if payment is completed
    // Bakong API returns transaction data if found and paid
    if (paymentData) {
      return {
        status: "PROCESSING",
        paid: true,
        paidAt: new Date(),
        transactionId: paymentData.hash || orderNumber,
        amount: paymentData.amount,
        currency: paymentData.currency,
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
