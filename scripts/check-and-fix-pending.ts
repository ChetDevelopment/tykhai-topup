import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY";

async function checkAllPendingOrders() {
  console.log("=== Checking All Pending Orders ===\n");

  const pendingOrders = await prisma.order.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (pendingOrders.length === 0) {
    console.log("✅ No pending orders!");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${pendingOrders.length} pending order(s)\n`);

  for (const order of pendingOrders) {
    console.log(`Order: ${order.orderNumber}`);
    console.log(`- Created: ${order.createdAt}`);
    console.log(`- Amount: ${order.amountUsd} ${order.currency}`);
    
    let md5Hash = order.metadata?.bakongMd5;
    if (!md5Hash && order.qrString) {
      md5Hash = crypto.createHash("md5").update(order.qrString).digest("hex");
    }

    if (!md5Hash) {
      console.log("- ❌ No MD5 hash - cannot verify\n");
      continue;
    }

    console.log(`- MD5: ${md5Hash}`);

    // Check Bakong API
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

      if (data.data && data.data.acknowledgedDateMs) {
        console.log(`- ✅ PAYMENT CONFIRMED in Bakong!`);
        console.log(`- Paid At: ${new Date(data.data.acknowledgedDateMs).toISOString()}`);
        console.log(`- Amount: ${data.data.amount} ${data.data.currency}`);
        
        // Auto-update the order
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(data.data.acknowledgedDateMs),
            metadata: {
              ...order.metadata,
              paymentVerifiedBy: "auto_script",
              paymentVerifiedAt: new Date().toISOString(),
              bakongTransactionId: data.data.hash,
            },
          },
        });
        
        console.log(`- ✅ Order updated to PAID\n`);
      } else {
        console.log(`- ⏳ Payment not yet confirmed in Bakong\n`);
      }
    } catch (err: any) {
      console.log(`- ❌ Bakong API error: ${err.message}\n`);
    }
  }

  await prisma.$disconnect();
  console.log("=== Check Complete ===");
}

checkAllPendingOrders().catch(console.error);
