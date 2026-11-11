const list = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// Lu une seule fois au démarrage : tout le reste du code passe par cet objet
const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  hashSecret: process.env.HASH_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  corsOrigins: list(process.env.CORS_ORIGINS),
  adminEmails: list(process.env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || '',
  },
  disableJobs: process.env.DISABLE_JOBS === 'true',
};

const REQUIRED = ['databaseUrl', 'jwtSecret', 'hashSecret', 'googleClientId'];
const ENV_NAMES = {
  databaseUrl: 'DATABASE_URL',
  jwtSecret: 'JWT_SECRET',
  hashSecret: 'HASH_SECRET',
  googleClientId: 'GOOGLE_CLIENT_ID',
};

/** Noms des variables obligatoires absentes (vide si tout est là). */
function missingEnv() {
  return REQUIRED.filter((key) => !env[key]).map((key) => ENV_NAMES[key]);
}

module.exports = { env, missingEnv };
