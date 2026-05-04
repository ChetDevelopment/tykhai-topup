import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPaymentConfig() {
  console.log("=== Payment Configuration Check ===\n");

  // Check environment variables
  console.log("Environment Variables:");
  console.log("- ENABLE_DEV_BAKONG:", process.env.ENABLE_DEV_BAKONG || "not set");
  console.log("- PAYMENT_SIMULATION_MODE:", process.env.PAYMENT_SIMULATION_MODE || "not set");
  console.log("- BAKONG_TOKEN:", process.env.BAKONG_TOKEN ? "SET (hidden)" : "NOT SET");
  console.log("- BAKONG_ACCOUNT:", process.env.BAKONG_ACCOUNT || "NOT SET");
  console.log("- BAKONG_MERCHANT_NAME:", process.env.BAKONG_MERCHANT_NAME || "NOT SET");
  console.log("");

  // Determine mode
  const isSimulation = 
    process.env.PAYMENT_SIMULATION_MODE === "true" || 
    process.env.ENABLE_DEV_BAKONG === "true";

  if (isSimulation) {
    console.log("⚠️  SIMULATION MODE ACTIVE");
    console.log("   - All payments will be test transactions");
    console.log("   - No real money will be transferred");
    console.log("   - QR codes will use test merchant data");
  } else {
    console.log("✅ REAL PAYMENT MODE ACTIVE");
    console.log("   - Payments will process REAL MONEY");
    console.log("   - QR codes will use your Bakong account");
    console.log("   - ⚠️  Test with small amounts!");
  }

  console.log("");

  // Check database settings
  console.log("Database Settings:");
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    
    if (!settings) {
      console.log("⚠️  No settings found in database");
    } else {
      console.log("- G2Bulk Token:", settings.g2bulkToken ? "Configured" : "Not configured");
      console.log("- G2Bulk Balance: $", settings.currentBalance || "0.00");
      console.log("- GameDrop Token:", settings.gameDropToken ? "Configured" : "Not configured");
      console.log("- System Status:", settings.systemStatus);
      console.log("- Maintenance Mode:", settings.maintenanceMode ? "ON" : "OFF");
    }
  } catch (err: any) {
    console.log("❌ Database error:", err.message);
  }

  console.log("");
  console.log("=== Configuration Check Complete ===");

  await prisma.$disconnect();
}

checkPaymentConfig().catch(console.error);
