const crypto = require('node:crypto');
const { env } = require('../config/env');

/**
 * Empreinte à sens unique d'un identifiant (compte Google, numéro WhatsApp, NPI en V2).
 * Permet de reconnaître une valeur déjà vue sans jamais la stocker en clair.
 */
function fingerprint(value) {
  return crypto
    .createHmac('sha256', env.hashSecret)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

module.exports = { fingerprint };
