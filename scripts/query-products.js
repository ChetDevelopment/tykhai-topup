// scripts/query-products.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.$queryRaw`
    SELECT p."name", g.slug, p.amount, p."priceUsd" 
    FROM "Product" p 
    JOIN "Game" g ON p."gameId" = g.id 
    WHERE p.active = true 
    ORDER BY g.slug, p.amount
    LIMIT 30
  `;
  
  console.log("=== Your Active Products ===\n");
  console.log("Format: Product Name | Game | Amount | Price USD\n");
  
  products.forEach(p => {
    console.log(`${p.name} | ${p.slug} | ${p.amount} | $${p.priceUsd}`);
  });
  
  console.log("\n=== Next Steps ===");
  console.log("1. Go to https://partner.gamedrop.io");
  console.log("2. Login with your GameDrop credentials");
  console.log("3. Go to Offers section");
  console.log("4. Find the numeric Offer ID for each product");
  console.log("5. Update your database with this SQL:\n");
  
  console.log("-- Example SQL (replace with actual Offer IDs from GameDrop):");
  if (products.length > 0) {
    console.log(`UPDATE "Product" SET "gameDropOfferId" = 1001 WHERE "name" = '${products[0].name}';`);
  }
  if (products.length > 1) {
    console.log(`UPDATE "Product" SET "gameDropOfferId" = 1002 WHERE "name" = '${products[1].name}';`);
  }
  console.log("\n-- Repeat for ALL products!");
  console.log("-- Then run: npx prisma db push");

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
