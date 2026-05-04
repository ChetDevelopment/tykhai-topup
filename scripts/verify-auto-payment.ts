import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyAutoPayment() {
  console.log("=== Auto-Payment System Verification ===\n");

  // Get latest pending order
  const pendingOrder = await prisma.order.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (!pendingOrder) {
    console.log("✅ No pending orders - all payments auto-detected!");
  } else {
    console.log("⚠️  Found pending order:");
    console.log("- Order:", pendingOrder.orderNumber);
    console.log("- Status:", pendingOrder.status);
    console.log("- Created:", pendingOrder.createdAt);
    console.log("- Has MD5:", pendingOrder.metadata?.bakongMd5 ? "YES" : "NO");
    console.log("");
    console.log("This order should be checked by the payment status API");
  }

  // Get latest paid order
  const paidOrder = await prisma.order.findFirst({
    where: { status: "PAID" },
    orderBy: { paidAt: "desc" },
  });

  if (paidOrder) {
    console.log("\n✅ Latest paid order:");
    console.log("- Order:", paidOrder.orderNumber);
    console.log("- Status:", paidOrder.status);
    console.log("- Paid At:", paidOrder.paidAt);
    console.log("- Delivery Status:", paidOrder.deliveryStatus);
    console.log("- Verified By:", paidOrder.metadata?.paymentVerifiedBy || "N/A");
  }

  // Get latest delivered order
  const deliveredOrder = await prisma.order.findFirst({
    where: { status: "DELIVERED" },
    orderBy: { deliveredAt: "desc" },
  });

  if (deliveredOrder) {
    console.log("\n✅ Latest delivered order:");
    console.log("- Order:", deliveredOrder.orderNumber);
    console.log("- Status:", deliveredOrder.status);
    console.log("- Delivered At:", deliveredOrder.deliveredAt);
    console.log("- Time from PAID to DELIVERED:", 
      deliveredOrder.deliveredAt && deliveredOrder.paidAt 
        ? `${(deliveredOrder.deliveredAt.getTime() - deliveredOrder.paidAt.getTime()) / 1000}s`
        : "N/A");
  }

  await prisma.$disconnect();
  console.log("\n=== Verification Complete ===");
}

verifyAutoPayment().catch(console.error);
