import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testProviderConnections() {
  console.log("=== Testing Provider API Connections ===\n");

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  
  if (!settings) {
    console.error("Settings not found in database");
    return;
  }

  console.log("Settings loaded:");
  console.log("- GameDrop Token:", settings.gameDropToken ? "Configured" : "Not configured");
  console.log("- G2Bulk Token:", settings.g2bulkToken ? "Configured" : "Not configured\n");

  // Test GameDrop
  if (settings.gameDropToken) {
    console.log("Testing GameDrop API...");
    try {
      const res = await fetch("https://partner.gamesdrop.io/api/v1/offers/balance", {
        headers: { Authorization: settings.gameDropToken },
        cache: "no-store",
      });
      
      console.log(`  Status: ${res.status} ${res.statusText}`);
      
      if (res.ok) {
        const data = await res.json();
        console.log("  Response:", JSON.stringify(data, null, 2));
        console.log("  GameDrop connection successful\n");
      } else {
        const errorText = await res.text();
        console.log("  Error Response:", errorText);
        console.log("  GameDrop connection failed\n");
      }
    } catch (err: any) {
      console.log("  GameDrop error:", err.message, "\n");
    }
  } else {
    console.log("Skipping GameDrop test - no token configured\n");
  }

  // Test G2Bulk
  if (settings.g2bulkToken) {
    console.log("Testing G2Bulk API...");
    try {
      const res = await fetch("https://api.g2bulk.com/v1/getMe", {
        headers: { "X-API-Key": settings.g2bulkToken },
        cache: "no-store",
      });
      
      console.log(`  Status: ${res.status} ${res.statusText}`);
      
      if (res.ok) {
        const data = await res.json();
        console.log("  Response:", JSON.stringify(data, null, 2));
        console.log("  G2Bulk connection successful\n");
      } else {
        const errorText = await res.text();
        console.log("  Error Response:", errorText);
        console.log("  G2Bulk connection failed\n");
      }
    } catch (err: any) {
      console.log("  G2Bulk error:", err.message, "\n");
    }
  } else {
    console.log("Skipping G2Bulk test - no token configured\n");
  }

  await prisma.$disconnect();
  console.log("=== Test Complete ===");
}

testProviderConnections().catch(console.error);
