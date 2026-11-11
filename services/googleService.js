const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');
const AppError = require('../utils/AppError');

const client = new OAuth2Client();

/**
 * Vérifie l'ID token renvoyé par Google Identity Services (signature, expiration,
 * et qu'il a bien été émis pour notre appli) et renvoie l'identité Google.
 */
async function verifyGoogleCredential(credential) {
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw AppError.unauthorized('Connexion Google invalide. Réessaie.', 'GOOGLE_TOKEN_INVALID');
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw AppError.unauthorized(
      "Ton adresse Google n'est pas vérifiée. Utilise un autre compte.",
      'GOOGLE_EMAIL_UNVERIFIED',
    );
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    firstName: payload.given_name || null,
  };
}

module.exports = { verifyGoogleCredential };
