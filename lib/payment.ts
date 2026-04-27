import crypto from "crypto";
import { KHQR } from "bakong-khqr-npm";

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
  if (args.method === "BAKONG" && BAKONG_TOKEN) return initiateBakong(args);
  
  if (SIM_MODE) return simulatePayment(args);
  if (args.method === "TRUEMONEY") return initiateTrueMoney(args);
  if (args.method === "WING") return initiateWing(args);
  if (args.method === "BANK") return initiateBankTransfer(args);
  if (args.method === "USDT") return initiateUsdt(args);
  throw new Error(`Unsupported payment method: ${args.method}`);
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
    static: true,
  });
  
  if (!qrResult) {
    throw new Error("Bakong: failed to generate QR");
  }

  const md5Hash = khqr.generate_md5(qrResult);

  const paymentRef = md5Hash;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectUrl = `${baseUrl}/checkout/${args.orderNumber}`;

  return {
    paymentRef,
    redirectUrl,
    qrString: qrResult,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    instructions: `Scan the QR code with Bakong app to pay ${amount} ${args.currency}`,
  };
}

export async function checkBakongPayment(md5Hash: string): Promise<{
  status: string;
  paid: boolean;
  amount?: string;
  currency?: string;
} | null> {
  if (!BAKONG_TOKEN) {
    return null;
  }

  const khqr = new KHQR(BAKONG_TOKEN, "https://api-bakong.nbc.gov.kh/v1");

  try {
    console.log("[bakong] check_payment:", md5Hash);
    const result = await khqr.check_payment(md5Hash);
    console.log("[bakong] check_payment result:", result, "type:", typeof result);
    return {
      status: result as string || "UNPAID",
      paid: result === "PAID",
    };
  } catch (e) {
    console.warn("[bakong] check_payment failed:", e);
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