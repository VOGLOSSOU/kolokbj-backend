require('dotenv').config({ quiet: true });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secret-de-test';
process.env.HASH_SECRET = 'empreinte-de-test';
process.env.GOOGLE_CLIENT_ID = 'client-de-test';
process.env.ADMIN_EMAILS = 'admin@test.dev';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';

// Les tests d'intégration vident la base : ils ne tournent JAMAIS sur DATABASE_URL,
// seulement sur TEST_DATABASE_URL. Sans elle, ils sont ignorés.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://inutilise@127.0.0.1:1/inutilise';
