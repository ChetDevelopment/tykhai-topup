const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const game = await prisma.game.findUnique({
    where: { slug: 'free-fire' }
  });

  if (!game) {
    console.log('Free Fire game not found');
    return;
  }

  const products = await prisma.product.findMany({
    where: { gameId: game.id },
    orderBy: [
      { amount: 'asc' },
      { name: 'asc' }
    ]
  });

  console.log('\nFree Fire Products (from G2Bulk catalogue):\n');
  console.log('='.repeat(80));
  console.log('| %-35s | %8s | %10s | %-20s |', 'Product Name', 'Diamonds', 'Price USD', 'G2Bulk Catalogue');
  console.log('='.repeat(80));

  products.forEach(p => {
    const name = p.name.padEnd(35).substring(0, 35);
    const diamonds = (p.amount > 0 ? p.amount.toString() : 'N/A').padStart(8);
    const price = `$${p.priceUsd.toFixed(2)}`.padStart(10);
    const catalogue = (p.g2bulkCatalogueName || 'Not set').padEnd(20).substring(0, 20);
    console.log(`| ${name} | ${diamonds} | ${price} | ${catalogue} |`);
  });

  console.log('='.repeat(80));
  console.log(`\nTotal: ${products.length} products`);
  
  const withG2Bulk = products.filter(p => p.g2bulkCatalogueName).length;
  console.log(`With G2Bulk mapping: ${withG2Bulk}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
