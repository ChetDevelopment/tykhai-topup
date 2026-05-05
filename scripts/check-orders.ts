import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkOrders() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  orders.forEach(o => {
    console.log(`${o.orderNumber} - ${o.status} - ${o.createdAt}`);
  });

  await prisma.$disconnect();
}

checkOrders().catch(console.error);
