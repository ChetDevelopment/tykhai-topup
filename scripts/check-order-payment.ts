import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

async function checkOrderPayment() {
  console.log("=== Checking Order TY-ND9RLW ===\n");

  const order = await prisma.order.findUnique({
    where: { orderNumber: "TY-ND9RLW" },
  });

  if (!order) {
    console.log("❌ Order not found");
    await prisma.$disconnect();
    return;
  }

  console.log("Order Details:");
  console.log("- Order Number:", order.orderNumber);
  console.log("- Status:", order.status);
  console.log("- Payment Ref:", order.paymentRef);
  console.log("- Amount:", order.amountUsd, order.currency);
  console.log("- Created:", order.createdAt);
  console.log("");

  const md5Hash = order.metadata?.bakongMd5;
  
  if (!md5Hash) {
    console.log("❌ No MD5 hash in metadata");
    await prisma.$disconnect();
    return;
  }

  console.log("MD5 Hash:", md5Hash);
  console.log("");

  // Check Bakong API
  console.log("Checking Bakong API...");
  const BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY";

  try {
    const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BAKONG_TOKEN}`,
      },
      body: JSON.stringify({ md5: md5Hash }),
    });

    console.log("Bakong API Status:", response.status, response.statusText);
    
    const data = await response.json();
    console.log("\nBakong API Response:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    if (data.data) {
      console.log("Payment Details:");
      console.log("- Status:", data.data.status || "N/A");
      console.log("- Amount:", data.data.amount, data.data.currency);
      console.log("- From:", data.data.fromAccountId);
      console.log("- To:", data.data.toAccountId);
      console.log("- Paid At:", data.data.acknowledgedDateMs ? new Date(data.data.acknowledgedDateMs).toISOString() : "N/A");
      console.log("");

      if (data.data.status === "PAID" || data.data.status === "COMPLETED") {
        console.log("✅ PAYMENT CONFIRMED IN BAKONG!");
        console.log("Order should be updated to PAID");
        
        // Update the order
        console.log("\nUpdating order to PAID...");
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            metadata: {
              ...order.metadata,
              paymentVerifiedBy: "manual_check",
              paymentVerifiedAt: new Date().toISOString(),
              bakongTransactionId: data.data.hash,
            },
          },
        });
        console.log("✅ Order updated to PAID!");
      } else {
        console.log("⏳ Payment status in Bakong:", data.data.status);
        console.log("Waiting for payment to complete...");
      }
    }

  } catch (err: any) {
    console.log("❌ Bakong API Error:", err.message);
  }

  await prisma.$disconnect();
  console.log("\n=== Check Complete ===");
}

checkOrderPayment().catch(console.error);
