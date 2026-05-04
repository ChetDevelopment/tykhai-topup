import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  
  if (!settings) {
    console.log("No settings found");
    return;
  }

  console.log("Current Settings:");
  console.log("- G2Bulk Token:", settings.g2bulkToken ? "Configured" : "Not configured");
  console.log("- G2Bulk Partner ID:", settings.g2bulkPartnerId);
  console.log("- Current Balance: $", settings.currentBalance);
  console.log("- Last Balance Check:", settings.lastBalanceCheck);
  console.log("- GameDrop Token:", settings.gameDropToken ? "Configured" : "Not configured");
  console.log("- GameDrop Partner ID:", settings.gameDropPartnerId);
  
  await prisma.$disconnect();
}

checkSettings().catch(console.error);
