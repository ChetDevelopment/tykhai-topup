/**
 * Payment Verification Diagnostic Tool
 * 
 * Run this AFTER making a payment to check why verification failed
 */

import { prisma } from "../lib/prisma";
import { checkBakongPayment } from "../lib/payment";

async function diagnose() {
  console.log("🔍 Payment Verification Diagnostic\n");

  // Get recent pending orders
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 min
    },
    take: 5,
    include: {
      game: true,
      product: true,
    },
  });

  if (pendingOrders.length === 0) {
    console.log("✅ No pending orders found!");
    return;
  }

  console.log(`⚠️ Found ${pendingOrders.length} pending order(s)\n`);

  for (const order of pendingOrders) {
    console.log(`════════════════════════════════════════`);
    console.log(`Order: ${order.orderNumber}`);
    console.log(`Amount: ${order.amountUsd} ${order.currency}`);
    console.log(`Game: ${order.game.name} - ${order.product.name}`);
    console.log(`Player UID: ${order.playerUid}`);
    console.log(`Created: ${order.createdAt.toLocaleString()}`);
    
    const metadata = order.metadata as any;
    console.log(`\n📋 Payment Info:`);
    console.log(`  - Payment Ref: ${order.paymentRef || "MISSING"}`);
    console.log(`  - Bakong MD5: ${metadata?.bakongMd5 ? "✅ Present" : "❌ MISSING"}`);
    console.log(`  - QR Generated: ${order.qrString ? "✅ Yes" : "❌ No"}`);
    console.log(`  - Expires: ${order.paymentExpiresAt?.toLocaleString() || "NEVER"}`);
    
    // Check if expired
    const isExpired = order.paymentExpiresAt && order.paymentExpiresAt < new Date();
    if (isExpired) {
      console.log(`  ⚠️  ORDER EXPIRED!`);
    }

    // Try to verify with Bakong
    if (metadata?.bakongMd5) {
      console.log(`\n🔍 Checking Bakong API...`);
      try {
        const result = await checkBakongPayment(metadata.bakongMd5);
        console.log(`  - Status: ${result.status}`);
        console.log(`  - Paid: ${result.paid ? "✅ YES" : "❌ NO"}`);
        console.log(`  - Transaction ID: ${result.transactionId || "N/A"}`);
        console.log(`  - Amount: ${result.amount || "N/A"} ${result.currency || "N/A"}`);
        
        if (result.paid) {
          console.log(`\n✅ PAYMENT DETECTED! Order should be marked as PAID`);
          console.log(`   Run: npm run verify:payment -- ${order.orderNumber}`);
        } else {
          console.log(`\n⚠️  Payment not detected by Bakong yet`);
          console.log(`   Possible causes:`);
          console.log(`   1. User hasn't paid yet`);
          console.log(`   2. Bakong API delay (wait 1-2 min)`);
          console.log(`   3. MD5 hash mismatch`);
        }
      } catch (err: any) {
        console.log(`  ❌ Bakong API Error: ${err.message}`);
        console.log(`   Possible causes:`);
        console.log(`   1. Invalid BAKONG_TOKEN`);
        console.log(`   2. Bakong API down`);
        console.log(`   3. Network issue`);
      }
    } else {
      console.log(`\n⚠️  Cannot verify - missing Bakong MD5 hash`);
      console.log(`   This means QR generation didn't save the hash properly`);
    }

    console.log(`\n`);
  }

  // Check paid but not delivered orders
  const paidOrders = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "PROCESSING"] },
      deliveredAt: null,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last 1 hour
    },
    take: 5,
    include: {
      game: true,
      product: true,
      deliveryJobs: {
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (paidOrders.length > 0) {
    console.log(`\n════════════════════════════════════════`);
    console.log(`⚠️ Found ${paidOrders.length} paid but not delivered order(s)\n`);

    for (const order of paidOrders) {
      console.log(`Order: ${order.orderNumber}`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Paid At: ${order.paidAt?.toLocaleString() || "N/A"}`);
      console.log(`  Delivery Jobs: ${order.deliveryJobs.length}`);
      
      if (order.deliveryJobs.length > 0) {
        const job = order.deliveryJobs[0];
        console.log(`  - Job Status: ${job.status}`);
        console.log(`  - Attempts: ${job.attempt}`);
        console.log(`  - Error: ${job.errorMessage || "None"}`);
      } else {
        console.log(`  ⚠️  NO DELIVERY JOB CREATED!`);
      }
      console.log(``);
    }
  }

  console.log(`════════════════════════════════════════`);
  console.log(`\n💡 Next Steps:`);
  console.log(`   1. For PENDING orders with payment detected:`);
  console.log(`      npm run verify:payment -- <orderNumber>`);
  console.log(``);
  console.log(`   2. For PAID but not delivered:`);
  console.log(`      npm run worker`);
  console.log(``);
  console.log(`   3. Check Bakong webhook configuration:`);
  console.log(`      Webhook URL: https://tykhai.vercel.app/api/payment/webhook/bakong`);
}

diagnose()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Diagnostic failed:", err);
    process.exit(1);
  });
