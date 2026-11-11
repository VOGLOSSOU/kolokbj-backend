const prisma = require('../lib/prisma');
const { verifySessionToken } = require('../services/tokenService');
const { isAdmin } = require('../utils/serializers');
const AppError = require('../utils/AppError');

const SESSION_EXPIRED = 'Ta session a expiré. Reconnecte-toi.';

/** Lit le JWT (en-tête Authorization: Bearer) et charge l'utilisateur avec son profil. */
async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized();

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    throw AppError.unauthorized(SESSION_EXPIRED, 'SESSION_EXPIRED');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { profile: true },
  });
  // Compte supprimé depuis l'émission du jeton
  if (!user) throw AppError.unauthorized(SESSION_EXPIRED, 'SESSION_EXPIRED');

  req.user = user;
  next();
}

/** Bloque les comptes bannis ou suspendus (ils gardent seulement l'accès à leur session). */
function requireActive(req, res, next) {
  if (req.user.profileStatus === 'BANNED') {
    throw AppError.forbidden('Ton compte a été banni.', 'ACCOUNT_BANNED');
  }
  if (req.user.profileStatus === 'SUSPENDED') {
    throw AppError.forbidden('Ton compte est suspendu.', 'ACCOUNT_SUSPENDED');
  }
  next();
}

/** Numéro WhatsApp renseigné et conditions acceptées. */
function requireOnboarded(req, res, next) {
  if (!req.user.whatsapp || !req.user.termsAcceptedAt) {
    throw AppError.forbidden(
      "Ajoute ton numéro WhatsApp et accepte les conditions d'abord.",
      'ONBOARDING_REQUIRED',
    );
  }
  next();
}

/** Seuls les profils validés voient les autres et peuvent être vus. */
function requireApproved(req, res, next) {
  if (req.user.profileStatus !== 'APPROVED' || !req.user.profile) {
    throw AppError.forbidden(
      "Ton profil doit être validé pour accéder à cette partie de l'appli.",
      'PROFILE_NOT_APPROVED',
    );
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) throw AppError.forbidden();
  next();
}

module.exports = { authenticate, requireActive, requireOnboarded, requireApproved, requireAdmin };
