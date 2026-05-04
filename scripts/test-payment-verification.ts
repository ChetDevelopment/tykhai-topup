import { PrismaClient } from "@prisma/client";
import { checkBakongPayment } from "@/lib/payment";

const prisma = new PrismaClient();

async function testPaymentVerification() {
  console.log("=== Testing Bakong Payment Verification ===\n");

  // Get latest pending order
  const pendingOrder = await prisma.order.findFirst({
    where: {
      status: "PENDING",
      paymentRef: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!pendingOrder) {
    console.log("No pending orders found");
    await prisma.$disconnect();
    return;
  }

  console.log("Latest Pending Order:");
  console.log("- Order Number:", pendingOrder.orderNumber);
  console.log("- Payment Ref:", pendingOrder.paymentRef);
  console.log("- Status:", pendingOrder.status);
  console.log("- Created:", pendingOrder.createdAt);
  console.log("");

  // Get MD5 hash from metadata or calculate from QR
  let md5Hash = pendingOrder.metadata?.bakongMd5;
  
  if (!md5Hash && pendingOrder.qrString) {
    const crypto = require("crypto");
    md5Hash = crypto.createHash("md5").update(pendingOrder.qrString).digest("hex");
    console.log("Calculated MD5 from QR:", md5Hash);
  }

  if (!md5Hash) {
    console.log("❌ No MD5 hash available");
    await prisma.$disconnect();
    return;
  }

  console.log("Checking Bakong API...");
  console.log("MD5 Hash:", md5Hash);
  console.log("");

  try {
    const result = await checkBakongPayment(md5Hash);
    
    console.log("Bakong API Response:");
    console.log("- Status:", result.status);
    console.log("- Paid:", result.paid);
    console.log("- Amount:", result.amount);
    console.log("- Currency:", result.currency);
    console.log("- Transaction ID:", result.transactionId);
    console.log("- Paid At:", result.paidAt);
    console.log("");

    if (result.paid) {
      console.log("✅ PAYMENT CONFIRMED!");
      console.log("Order should be updated to PAID");
    } else {
      console.log("⏳ Payment still pending in Bakong");
    }

  } catch (err: any) {
    console.log("❌ Error checking Bakong API:", err.message);
  }

  await prisma.$disconnect();
  console.log("\n=== Test Complete ===");
}

testPaymentVerification().catch(console.error);
