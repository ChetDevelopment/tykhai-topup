import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testAndSaveBalance() {
  console.log("=== Testing G2Bulk and Updating Database ===\n");

  // Get token from .env
  const token = process.env.G2BULK_TOKEN;
  
  if (!token) {
    console.error("G2BULK_TOKEN not found in .env");
    return;
  }

  console.log("Token found, testing API...");

  try {
    const res = await fetch("https://api.g2bulk.com/v1/getMe", {
      headers: { "X-API-Key": token },
      cache: "no-store",
    });

    console.log(`Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.log(`Error: ${res.status} - ${errorText}`);
      return;
    }

    const data = await res.json();
    console.log("API Response:", JSON.stringify(data, null, 2));

    if (!data.success) {
      console.log("API returned success=false");
      return;
    }

    console.log("\nUpdating database...");
    
    // Update settings in database
    const updated = await prisma.settings.upsert({
      where: { id: 1 },
      update: {
        currentBalance: typeof data.balance === 'number' ? data.balance : 0,
        lastBalanceCheck: new Date(),
        g2bulkPartnerId: typeof data.user_id === 'number' ? data.user_id : null,
        g2bulkToken: token,
      },
      create: {
        id: 1,
        currentBalance: typeof data.balance === 'number' ? data.balance : 0,
        lastBalanceCheck: new Date(),
        g2bulkPartnerId: typeof data.user_id === 'number' ? data.user_id : null,
        g2bulkToken: token,
      },
    });

    console.log("Database updated successfully!");
    console.log("- Balance:", updated.currentBalance);
    console.log("- Partner ID:", updated.g2bulkPartnerId);
    console.log("- Last Check:", updated.lastBalanceCheck);

  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
    console.log("\n=== Test Complete ===");
  }
}

testAndSaveBalance().catch(console.error);
