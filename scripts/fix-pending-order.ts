import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixOrder() {
  console.log("Updating order TY-ND9RLW to PAID...\n");

  await prisma.order.update({
    where: { orderNumber: "TY-ND9RLW" },
    data: {
      status: "PAID",
      paidAt: new Date("2026-05-04T10:06:10.000Z"),
      metadata: {
        bakongMd5: "5334e8d503dfb836536d4591fac22ecf",
        paymentVerifiedBy: "manual_fix",
        bakongTransactionId: "24f9bd1d601e1b4354c2f59a6ccfd693fb2439d897034644de4d33084bcdd2dc",
      },
    },
  });

  console.log("✅ Order TY-ND9RLW updated to PAID!");
  console.log("Payment was confirmed at: 2026-05-04T10:06:10.000Z");
  
  await prisma.$disconnect();
}

fixOrder().catch(console.error);
