import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPendingOrders() {
  console.log("=== Pending Orders ===\n");

  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (pendingOrders.length === 0) {
    console.log("No pending orders found");
  } else {
    console.log(`Found ${pendingOrders.length} pending order(s):\n`);
    
    pendingOrders.forEach((order, i) => {
      console.log(`${i + 1}. Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log(`   Amount: ${order.amountUsd} ${order.currency}`);
      console.log(`   Payment Ref: ${order.paymentRef}`);
      console.log(`   Has MD5: ${order.metadata?.bakongMd5 ? 'YES' : 'NO'}`);
      console.log("");
    });
  }

  await prisma.$disconnect();
}

checkPendingOrders().catch(console.error);
