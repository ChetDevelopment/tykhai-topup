import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY";

async function checkOrder() {
  const order = await prisma.order.findUnique({
    where: { orderNumber: "TY-5KJLCA" },
  });

  if (!order) {
    console.log("❌ Order not found");
    await prisma.$disconnect();
    return;
  }

  console.log("Order:", order.orderNumber);
  console.log("Status:", order.status);
  console.log("Created:", order.createdAt);
  console.log("");

  let md5Hash = order.metadata?.bakongMd5;
  if (!md5Hash && order.qrString) {
    md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
  }

  if (!md5Hash) {
    console.log("❌ No MD5");
    await prisma.$disconnect();
    return;
  }

  console.log("MD5:", md5Hash);
  console.log("");
  console.log("Checking Bakong API...");
  
  const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BAKONG_TOKEN}`,
    },
    body: JSON.stringify({ md5: md5Hash }),
  });

  const data = await response.json();
  console.log("Bakong Response:", JSON.stringify(data, null, 2));
  
  if (data.data && data.data.acknowledgedDateMs) {
    console.log("\n✅ PAYMENT CONFIRMED IN BAKONG!");
    console.log("Paid at:", new Date(data.data.acknowledgedDateMs).toISOString());
    
    if (order.status === "PENDING") {
      console.log("\n⚠️  Auto-detection FAILED - updating manually...");
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date(data.data.acknowledgedDateMs) },
      });
      console.log("✅ Updated to PAID!");
    }
  } else {
    console.log("\n⏳ Payment NOT in Bakong yet");
  }

  await prisma.$disconnect();
}

checkOrder().catch(console.error);
