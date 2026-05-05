import { prisma } from "../lib/prisma";

async function manualDeliver() {
  console.log("🔧 Manual Delivery for Stuck PAID Orders\n");

  const paidOrders = await prisma.order.findMany({
    where: {
      status: "PAID",
      deliveredAt: null,
    },
    include: {
      game: true,
      product: true,
    },
  });

  if (paidOrders.length === 0) {
    console.log("✅ No stuck PAID orders!");
    return;
  }

  console.log(`Found ${paidOrders.length} stuck PAID order(s)\n`);

  for (const order of paidOrders) {
    console.log(`Processing: ${order.orderNumber}`);
    
    // Check if it has a delivery provider
    const hasProvider = order.product.gameDropOfferId || order.product.g2bulkCatalogueName;
    
    if (hasProvider) {
      console.log(`  ⚠️  Has provider but stuck - needs investigation`);
    } else {
      console.log(`  ℹ️  No provider - manual fulfillment`);
      
      // Mark as delivered manually
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "DELIVERED",
          deliveryStatus: "DELIVERED",
          deliveredAt: new Date(),
          deliveryNote: "Manual fulfillment (no API provider)",
        },
      });
      
      console.log(`  ✅ Marked as DELIVERED`);
    }
    
    console.log(``);
  }

  console.log("✅ Manual delivery complete!");
}

manualDeliver()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
