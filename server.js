require('dotenv').config({ quiet: true });

const { env, missingEnv } = require('./config/env');

const missing = missingEnv();
if (missing.length > 0) {
  console.error(`Variables manquantes dans .env : ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./app');
const prisma = require('./lib/prisma');
const { startScheduler } = require('./jobs/scheduler');

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Connexion PostgreSQL OK');
  } catch (error) {
    console.error('Impossible de se connecter à PostgreSQL :', error.message);
    process.exit(1);
  }

  if (env.adminEmails.length === 0) {
    console.warn('ADMIN_EMAILS est vide : personne ne peut valider les profils.');
  }

  const server = app.listen(env.port, () => {
    console.log(`API Kolok démarrée sur http://localhost:${env.port}/api`);
  });

  if (!env.disableJobs) startScheduler();

  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
