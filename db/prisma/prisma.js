// prisma.js
const { PrismaClient } = require('@prisma/client');

let prisma = process.env.NODE_ENV === 'production' ? new PrismaClient() : undefined;

if (!global.prisma) {
  global.prisma = new PrismaClient();
}
prisma = global.prisma;


module.exports = prisma;
