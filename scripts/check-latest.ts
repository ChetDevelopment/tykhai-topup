import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkLatest() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
  });

  console.log("Latest Order:", order?.orderNumber);
  console.log("Status:", order?.status);
  console.log("Paid At:", order?.paidAt);
  console.log("Created:", order?.createdAt);
  
  await prisma.$disconnect();
}

checkLatest().catch(console.error);
