// scripts/list-gamedrop-offers.js
// Fetches all available offers from GameDrop API

const token = process.env.GAME_DROP_TOKEN;

if (!token) {
  console.error("ERROR: GAME_DROP_TOKEN not set");
  process.exit(1);
}

async function listOffers() {
  try {
    console.log("Fetching GameDrop balance and offers...\n");

    // Get balance (includes some offer info)
    const balanceRes = await fetch("https://partner.gamedrop.io/api/v1/offers/balance", {
      headers: { Authorization: token },
    });

    if (!balanceRes.ok) {
      console.error(`Failed to fetch: ${balanceRes.status}`);
      process.exit(1);
    }

    const balanceData = await balanceRes.json();
    console.log("=== Account Info ===");
    console.log(`Partner ID: ${balanceData.partnerId}`);
    console.log(`Balance: ${balanceData.balance} (Draft: ${balanceData.draftBalance})`);
    console.log(`Currency: ${JSON.stringify(balanceData.currency)}`);

    // Now let's try to get offers for each game
    // Common game slugs: mobile-legends, free-fire, genshin-impact, pubg-mobile
    const games = ["mobile-legends", "free-fire", "genshin-impact", "pubg-mobile"];
    
    console.log("\n=== Testing Offer IDs ===");
    console.log("We need to find the numeric Offer ID for each product.\n");

    // Try some common offer IDs (you may need to check GameDrop dashboard)
    console.log("Common GameDrop Offer IDs (check your dashboard):");
    console.log("1. Mobile Legends: Usually 1001-1999");
    console.log("2. Free Fire: Usually 2001-2999");
    console.log("3. Genshin Impact: Usually 3001-3999");
    console.log("4. PUBG Mobile: Usually 4001-4999\n");

    console.log("=== NEXT STEPS ===");
    console.log("1. Login to GameDrop partner portal: https://partner.gamedrop.io");
    console.log("2. Go to Offers section");
    console.log("3. Find the numeric ID for each product (e.g., '86 Diamonds' = Offer ID 1001)");
    console.log("4. Update your database with these IDs\n");

    console.log("=== SQL to Update Database ===");
    console.log("-- Replace the numbers with actual Offer IDs from GameDrop dashboard:");
    console.log(`
UPDATE "Product" SET "gameDropOfferId" = 1001 WHERE name = '86 Diamonds';
UPDATE "Product" SET "gameDropOfferId" = 1002 WHERE name = '172 Diamonds';
UPDATE "Product" SET "gameDropOfferId" = 2001 WHERE name = '100 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
-- Repeat for ALL products...
`);

  } catch (err) {
    console.error("Error:", err.message);
  }
}

listOffers();
