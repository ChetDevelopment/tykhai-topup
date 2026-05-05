import { prisma } from "../lib/prisma";
import { processDeliveryQueue } from "../lib/payment";

async function fixOrders() {
  console.log("🔧 Fixing Payment Verification Issues\n");

  // Fix 1: Update orders that are DELIVERED but missing paidAt
  const deliveredWithoutPaid = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      paidAt: null,
    },
    take: 20,
  });

  if (deliveredWithoutPaid.length > 0) {
    console.log(`Found ${deliveredWithoutPaid.length} DELIVERED orders without paidAt\n`);

    for (const order of deliveredWithoutPaid) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paidAt: order.createdAt, // Set paidAt to order creation time
        },
      });
      console.log(`✅ Fixed: ${order.orderNumber} - set paidAt`);
    }
  } else {
    console.log("✅ All DELIVERED orders have paidAt\n");
  }

  // Fix 2: Process delivery for stuck PAID orders
  const paidNotDelivered = await prisma.order.findMany({
    where: {
      status: "PAID",
      deliveredAt: null,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
    include: {
      game: true,
      product: true,
    },
  });

  if (paidNotDelivered.length > 0) {
    console.log(`\nFound ${paidNotDelivered.length} PAID orders not delivered\n`);

    console.log("🚀 Triggering delivery queue...\n");
    const result = await processDeliveryQueue(10);

    console.log("\n📊 Delivery Result:");
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Succeeded: ${result.succeeded}`);
    console.log(`   Failed: ${result.failed}`);
    console.log(`   Skipped: ${result.skipped}`);
  } else {
    console.log("\n✅ No stuck PAID orders\n");
  }

  console.log("\n✅ Fix complete!");
}

fixOrders()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fix failed:", err);
    process.exit(1);
  });
