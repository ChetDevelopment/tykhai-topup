import { prisma } from "../lib/prisma";

async function checkOrders() {
  const orders = await prisma.order.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  console.log("Recent Orders:\n");
  orders.forEach((o: any, i: number) => {
    console.log(`${i + 1}. ${o.orderNumber}`);
    console.log(`   Status: ${o.status}`);
    console.log(`   Created: ${new Date(o.createdAt).toLocaleString()}`);
    console.log(`   Paid: ${o.paidAt ? new Date(o.paidAt).toLocaleString() : "No"}`);
    console.log(`   Delivered: ${o.deliveredAt ? new Date(o.deliveredAt).toLocaleString() : "No"}\n`);
  });
}

checkOrders()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
