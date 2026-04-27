const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

async function disconnectPrisma() {
  await prisma.$disconnect();
}

module.exports = { prisma, disconnectPrisma };
