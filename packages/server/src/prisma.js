// A single shared PrismaClient instance. Creating a new one per request would
// exhaust database connections quickly, so every route imports this instead
// of constructing its own client.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
