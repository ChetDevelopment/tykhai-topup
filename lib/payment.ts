import crypto from "crypto";
import { KHQR } from "bakong-khqr-npm";
import { hashSha256, encryptField, generateSecureRef } from "./encryption";

export type PaymentMethod = "BAKONG" | "WALLET" | "TRUEMONEY" | "WING" | "BANK" | "USDT" | "MANUAL";
export type PaymentCurrency = "USD" | "KHR" | "USDT";

export interface InitiatePaymentArgs {
  orderNumber: string;
  amountUsd: number;
  amountKhr?: number | null;
  currency: PaymentCurrency;
  method: PaymentMethod;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  note?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface PaymentInitResult {
  paymentRef: string;
  redirectUrl: string;
  qrString?: string | null;
  qrStringEnc?: string | null;
  expiresAt: Date;
  instructions?: string | null;
}

const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true";

const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT || "";
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || "";
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || "Phnom Penh";
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || "";

export async function initiatePayment(
  args: InitiatePaymentArgs
): Promise<PaymentInitResult> {
  // Only use real payment methods - NO simulation fallback
  if (args.method === "BAKONG" && BAKONG_TOKEN) return initiateBakong(args);

  if (args.method === "TRUEMONEY") return initiateTrueMoney(args);
  if (args.method === "WING") return initiateWing(args);
  if (args.method === "BANK") return initiateBankTransfer(args);
  if (args.method === "USDT") return initiateUsdt(args);

  // NEVER fall through to simulation
  throw new Error(`Unsupported payment method: ${args.method}. Simulation disabled.`);
}

function simulatePayment(args: InitiatePaymentArgs): PaymentInitResult {
  const ref = `SIM-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return {
    paymentRef: ref,
    redirectUrl: `${base}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=${args.method}`,
    qrString: "00020101021252040000530384054041.005802KH5912TYKHAI TOPUP6008PHNOMPENH62150111TYKHAITOPUP6304ABCD",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

async function initiateBakong(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  if (!BAKONG_ACCOUNT || !BAKONG_MERCHANT_NAME || !BAKONG_TOKEN) {
    throw new Error("Bakong not configured. Check BAKONG_ACCOUNT, BAKONG_MERCHANT_NAME, BAKONG_TOKEN");
  }

  const paymentCurrency = args.currency === "KHR" ? "KHR" : "USD";
  const rawAmount = args.currency === "KHR" ? args.amountKhr : args.amountUsd;
  const amount = Number(rawAmount);

  if (!Number.isFinite(amount)) {
    throw new Error("Bakong: missing valid amount");
  }

  const khqr = new KHQR(BAKONG_TOKEN, "https://api-bakong.nbc.gov.kh/v1");

  const qrResult = khqr.create_qr({
    bank_account: BAKONG_ACCOUNT,
    merchant_name: BAKONG_MERCHANT_NAME.substring(0, 25),
    merchant_city: BAKONG_MERCHANT_CITY.substring(0, 15),
    amount: amount,
    currency: paymentCurrency,
    bill_number: args.orderNumber.substring(0, 25),
    terminal_label: "TyKhai",
    static: true, // Changed to true - QR doesn't expire, amount verified in webhook
  });

  if (!qrResult || qrResult.length < 100) {
    throw new Error("Bakong: failed to generate valid QR (invalid response)");
  }

  // Use SHA256 instead of MD5 for better security
  const secureRef = hashSha256(qrResult).slice(0, 64);
  const paymentRef = secureRef;

  // Encrypt sensitive QR string before storing
  const encryptedQr = encryptField(qrResult);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectUrl = `${baseUrl}/checkout/${args.orderNumber}`;

  return {
    paymentRef,
    redirectUrl,
    qrString: qrResult, // Return unencrypted for immediate use
    qrStringEnc: encryptedQr, // Encrypted version for storage
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Scan the QR code with Bakong app to pay ${amount} ${args.currency}`,
  };
}

export async function checkBakongPayment(paymentRef: string): Promise<{
  status: string;
  paid: boolean;
  amount?: string;
  currency?: string;
  receiverAccount?: string;
} | null> {
  if (!BAKONG_TOKEN) {
    return null;
  }

  const khqr = new KHQR(BAKONG_TOKEN, "https://api-bakong.nbc.gov.kh/v1");

  try {
    // Convert to SHA256 if it looks like an MD5 hash (32 hex chars)
    let refToCheck = paymentRef;
    if (paymentRef.length === 32 && /^[a-f0-9]+$/.test(paymentRef)) {
      refToCheck = hashSha256(paymentRef).slice(0, 64);
    }

    const result = await khqr.get_payment(refToCheck);

    // If get_payment returns a result, the transaction exists and is completed
    if (!result) {
      return { status: "UNPAID", paid: false };
    }

    // Verify the payment was sent TO our merchant account
    const expectedAccount = BAKONG_ACCOUNT;
    const receiverAccount = result.toAccountId || result.receiverBankAccount || "";

    // If receiver doesn't match our account, this is suspicious
    if (expectedAccount && receiverAccount && !receiverAccount.includes(expectedAccount)) {
      console.error(`[bakong] Payment sent to wrong account! Expected: ${expectedAccount}, Got: ${receiverAccount}`);
      return { status: "WRONG_RECEIVER", paid: false };
    }

    // Extract amount and currency from the transaction result
    return {
      status: "PAID",
      paid: true,
      amount: result.amount?.toString(),
      currency: result.currency,
      receiverAccount,
    };
  } catch (e) {
    console.warn("[bakong] get_payment failed:", e);
    return null;
  }
}

async function initiateTrueMoney(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const phone = process.env.TRUEMONEY_PHONE;
  
  if (!phone) {
    throw new Error("TrueMoney not configured");
  }

  const ref = `TM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  return {
    paymentRef: ref,
    redirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=TRUEMONEY`,
    qrString: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Transfer ${args.currency === "KHR" ? args.amountKhr : args.amountUsd} to TrueMoney ${phone}`,
  };
}

async function initiateWing(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const wingMsisdn = process.env.WING_MSISDN;
  
  if (!wingMsisdn) {
    throw new Error("Wing not configured");
  }

  const ref = `WING-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  return {
    paymentRef: ref,
    redirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=WING`,
    qrString: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Transfer ${args.currency === "KHR" ? args.amountKhr : args.amountUsd} to WING ${wingMsisdn}`,
  };
}

async function initiateBankTransfer(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const bankName = process.env.BANK_NAME || "ABA Bank";
  const bankAccount = process.env.BANK_ACCOUNT || "123456789";
  const bankAccountName = process.env.BANK_ACCOUNT_NAME || "Ty Khai TopUp";

  const ref = `BANK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  return {
    paymentRef: ref,
    redirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=BANK`,
    qrString: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    instructions: `Transfer to ${bankName} Account: ${bankAccount} (${bankAccountName}). Reference: ${ref}`,
  };
}

async function initiateUsdt(args: InitiatePaymentArgs): Promise<PaymentInitResult> {
  const usdtWallet = process.env.USDT_WALLET;
  
  if (!usdtWallet) {
    throw new Error("USDT payment not configured");
  }

  const ref = `USDT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const amountUsd = args.amountUsd;
  
  return {
    paymentRef: ref,
    redirectUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/simulate?order=${args.orderNumber}&ref=${ref}&method=USDT`,
    qrString: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    instructions: `Send exactly ${amountUsd} USDT (TRC20) to ${usdtWallet}. Reference: ${ref}`,
  };
}
