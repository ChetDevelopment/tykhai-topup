import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY";

async function checkLatestOrder() {
  console.log("=== Checking Latest Order ===\n");

  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!order) {
    console.log("No orders found");
    await prisma.$disconnect();
    return;
  }

  console.log("Order Details:");
  console.log("- Order Number:", order.orderNumber);
  console.log("- Status:", order.status);
  console.log("- Payment Ref:", order.paymentRef);
  console.log("- Amount:", order.amountUsd, order.currency);
  console.log("- Created:", order.createdAt);
  console.log("- Paid At:", order.paidAt || "NOT PAID");
  console.log("");

  let md5Hash = order.metadata?.bakongMd5;
  
  if (!md5Hash && order.qrString) {
    md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
    console.log("Calculated MD5 from QR:", md5Hash);
  }

  if (!md5Hash) {
    console.log("❌ No MD5 hash available");
    await prisma.$disconnect();
    return;
  }

  console.log("MD5 Hash:", md5Hash);
  console.log("");

  // Check Bakong API
  console.log("Checking Bakong API...");
  try {
    const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BAKONG_TOKEN}`,
      },
      body: JSON.stringify({ md5: md5Hash }),
    });

    const data = await response.json();
    console.log("Bakong API Response:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    if (data.data) {
      console.log("Payment Status:");
      console.log("- Amount:", data.data.amount, data.data.currency);
      console.log("- From:", data.data.fromAccountId);
      console.log("- To:", data.data.toAccountId);
      console.log("- Acknowledged:", data.data.acknowledgedDateMs ? new Date(data.data.acknowledgedDateMs).toISOString() : "NO");
      console.log("");

      if (data.data.acknowledgedDateMs) {
        console.log("✅ PAYMENT CONFIRMED IN BAKONG!");
        console.log("Order should be updated to PAID");
        
        if (order.status === "PENDING") {
          console.log("\n⚠️  Order is still PENDING - auto-detection failed!");
          console.log("Updating order to PAID now...");
          
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              paidAt: new Date(data.data.acknowledgedDateMs),
              metadata: {
                ...order.metadata,
                paymentVerifiedBy: "manual_check",
                paymentVerifiedAt: new Date().toISOString(),
                bakongTransactionId: data.data.hash,
              },
            },
          });
          
          console.log("✅ Order updated to PAID!");
        }
      } else {
        console.log("⏳ Payment not yet confirmed in Bakong");
      }
    }

  } catch (err: any) {
    console.log("❌ Bakong API Error:", err.message);
  }

  await prisma.$disconnect();
  console.log("\n=== Check Complete ===");
}

checkLatestOrder().catch(console.error);
