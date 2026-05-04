import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

async function diagnosePayment() {
  console.log("=== Payment Diagnosis ===\n");

  // Get latest order
  const order = await prisma.order.findFirst({
    where: {
      paymentRef: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!order) {
    console.log("❌ No orders found");
    await prisma.$disconnect();
    return;
  }

  console.log("Latest Order:");
  console.log("- Order Number:", order.orderNumber);
  console.log("- Status:", order.status);
  console.log("- Payment Ref:", order.paymentRef);
  console.log("- Created:", order.createdAt);
  console.log("- Amount:", order.amountUsd, order.currency);
  console.log("");

  console.log("Metadata:");
  console.log(JSON.stringify(order.metadata, null, 2));
  console.log("");

  // Check if MD5 hash exists
  let md5Hash = order.metadata?.bakongMd5;
  
  if (!md5Hash && order.qrString) {
    md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
    console.log("Calculated MD5 from QR:", md5Hash);
  }

  if (!md5Hash) {
    console.log("❌ No MD5 hash available - cannot verify payment!");
    console.log("");
    console.log("This is the problem - order missing bakongMd5 in metadata");
    await prisma.$disconnect();
    return;
  }

  console.log("MD5 Hash:", md5Hash);
  console.log("");

  // Check Bakong API directly
  console.log("Testing Bakong API...");
  try {
    const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BAKONG_TOKEN}`,
      },
      body: JSON.stringify({ md5: md5Hash }),
    });

    console.log("Bakong API Status:", response.status, response.statusText);
    
    const data = await response.json();
    console.log("Bakong API Response:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    if (data.data && data.data.status) {
      console.log("Payment Status in Bakong:", data.data.status);
      
      if (data.data.status === "PAID" || data.data.status === "COMPLETED") {
        console.log("✅ PAYMENT CONFIRMED IN BAKONG!");
        console.log("Order should be PAID but isn't - verification bug!");
      } else {
        console.log("⏳ Payment still pending in Bakong");
      }
    }

  } catch (err: any) {
    console.log("❌ Bakong API Error:", err.message);
  }

  await prisma.$disconnect();
  console.log("\n=== Diagnosis Complete ===");
}

diagnosePayment().catch(console.error);
