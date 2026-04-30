import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOKEN = 'kBY4HZffCwJZ0uE4hXhL5wNbFlkpCTPwXctYNu7TcGJX';

async function main() {
  try {
    const result = await prisma.settings.upsert({
      where: { id: 1 },
      update: { gameDropToken: TOKEN },
      create: {
        id: 1,
        siteName: 'Ty Khai TopUp',
        exchangeRate: 4100,
        gameDropToken: TOKEN,
      },
    });
    
    console.log('✅ GameDrop token saved successfully');
    console.log('Settings ID:', result.id);
    console.log('Token saved:', result.gameDropToken ? 'Yes (hidden for security)' : 'No');
  } catch (error) {
    console.error('❌ Error saving token:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
