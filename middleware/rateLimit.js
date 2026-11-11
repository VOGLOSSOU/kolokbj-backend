const { rateLimit } = require('express-rate-limit');

const skip = () => process.env.NODE_ENV === 'test';

// Connexion : 20 essais / 15 min / IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: {
    message: 'Trop de tentatives. Réessaie dans quelques minutes.',
    code: 'TOO_MANY_REQUESTS',
  },
});

// Filet de sécurité global : 300 requêtes / 5 min / IP
const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: { message: 'Trop de requêtes. Réessaie dans un instant.', code: 'TOO_MANY_REQUESTS' },
});

module.exports = { authLimiter, globalLimiter };
