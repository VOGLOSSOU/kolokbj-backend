const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { env } = require('../config/env');

// Une seule instance pour tout le process. La connexion n'est ouverte qu'à la première requête.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
});

module.exports = prisma;
