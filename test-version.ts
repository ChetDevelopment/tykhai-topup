import { prisma } from "./lib/prisma";

async function main() {
  const order = await prisma.order.findFirst({
    select: {
      id: true,
      version: true,
    }
  });
  console.log("Test query result:", order);
  console.log("Success! version field exists");
}

main().catch(console.error).finally(() => prisma.$disconnect());
