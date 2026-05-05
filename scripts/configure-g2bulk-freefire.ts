import { prisma } from "../lib/prisma";

async function configureG2Bulk() {
  console.log("🔧 Configuring G2Bulk for Free Fire Products\n");

  // Find Free Fire game
  const game = await prisma.game.findUnique({
    where: { slug: "free-fire" },
    include: {
      products: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!game) {
    console.log("❌ Free Fire game not found!");
    return;
  }

  console.log(`✅ Found Free Fire (ID: ${game.id})`);
  console.log(`📦 Products: ${game.products.length}\n`);

  // G2Bulk catalogue mapping for Free Fire Singapore/Myanmar
  // Format: freefire_sgmy_{amount}
  const cataloguePrefix = "freefire_sgmy";

  let updated = 0;
  let skipped = 0;

  for (const product of game.products) {
    const catalogueName = `${cataloguePrefix}_${product.amount}`;
    
    console.log(`Product: ${product.name} (${product.amount} diamonds)`);
    console.log(`  Current g2bulkCatalogueName: ${product.g2bulkCatalogueName || "NULL"}`);
    console.log(`  New g2bulkCatalogueName: ${catalogueName}`);

    // Update product with G2Bulk catalogue name
    await prisma.product.update({
      where: { id: product.id },
      data: {
        g2bulkCatalogueName: catalogueName,
      },
    });

    console.log(`  ✅ Updated\n`);
    updated++;
  }

  console.log(`═══════════════════════════════════════`);
  console.log(`✅ Configuration Complete!`);
  console.log(`   Updated: ${updated} products`);
  console.log(`   Skipped: ${skipped} products`);
  console.log(`\n🚀 Auto-delivery is now enabled for Free Fire!`);
}

configureG2Bulk()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
