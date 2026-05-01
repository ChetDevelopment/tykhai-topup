// scripts/fetch-gamedrop-offers.js
// Fetches all available offers from GameDrop API

const token = process.env.GAMEDROP_TOKEN;

if (!token) {
  console.error("ERROR: GAMEDROP_TOKEN not set");
  process.exit(1);
}

async function fetchOffers() {
  try {
    console.log("Fetching account balance and offers from GameDrop...\n");

    // Get balance (includes some offer info)
    const balanceRes = await fetch("https://partner.gamesdrop.io/api/v1/offers/balance", {
      headers: { Authorization: token },
    });

    if (!balanceRes.ok) {
      console.error(`Failed to fetch: ${balanceRes.status}`);
      const text = await balanceRes.text();
      console.error("Response:", text);
      process.exit(1);
    }

    const balanceData = await balanceRes.json();
    
    console.log("=== Account Info ===");
    console.log(`Partner ID: ${balanceData.partnerId}`);
    console.log(`Balance: ${balanceData.balance} (Draft: ${balanceData.draftBalance})`);
    console.log(`Currency: ${JSON.stringify(balanceData.currency)}`);

    console.log("\n=== Next Steps ===");
    console.log("1. Login to GameDrop partner portal: https://partner.gamesdrop.io");
    console.log("2. Go to Offers section");
    console.log("3. Find the numeric ID for each product (e.g., '86 Diamonds' = Offer ID 1001)");
    console.log("4. Update your database with these IDs:\n");

    console.log("-- SQL to update Product gameDropOfferId:");
    console.log(`
-- Example: Replace product names with actual names from your database
UPDATE "Product" SET "gameDropOfferId" = 1001 WHERE name = '86 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1002 WHERE name = '172 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 2001 WHERE name = '100 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
-- Repeat for ALL products...
`);

    console.log("\n=== Alternative: Use Prisma Studio ===");
    console.log("npx prisma studio");
    console.log("Then manually set gameDropOfferId for each product\n");

    console.log("=== Need Help? ===");
    console.log("Check GameDrop docs: https://partner.gamesdrop.io/docs");

  } catch (err) {
    console.error("Error:", err.message);
  }
}

fetchOffers();
