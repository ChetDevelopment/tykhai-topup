import { NextResponse } from "next/server";
import { sendOrderReceipt } from "@/lib/email";

export async function GET() {
  const test = await sendOrderReceipt({
    orderNumber: "TY-TEST001",
    gameName: "Mobile Legends",
    productName: "86 Diamonds",
    playerUid: "PLAYER123456",
    amountUsd: 9.99,
    amountKhr: 40935,
    currency: "USD",
    paidAt: new Date(),
    deliveredAt: new Date(),
    status: "DELIVERED",
    customerEmail: "jmyt6677@gmail.com",
  });

  return NextResponse.json({ success: test, message: test ? "Email sent!" : "Email failed" });
}