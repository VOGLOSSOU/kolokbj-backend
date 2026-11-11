const prisma = require('../lib/prisma');
const { verifyGoogleCredential } = require('../services/googleService');
const { signSessionToken } = require('../services/tokenService');
const { assertNotBanned } = require('../services/banService');
const { toSessionUser } = require('../utils/serializers');

/**
 * Connexion et inscription en un seul appel : le compte est créé à la première connexion.
 * Répond { token, user } ; le front garde le token et l'envoie dans Authorization: Bearer.
 */
async function google(req, res) {
  const identity = await verifyGoogleCredential(req.body.credential);

  let user = await prisma.user.findUnique({
    where: { googleSub: identity.sub },
    include: { profile: true },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      include: { profile: true },
    });
  } else {
    await assertNotBanned([
      { kind: 'GOOGLE_SUB', value: identity.sub },
      { kind: 'EMAIL', value: identity.email },
    ]);
    user = await prisma.user.create({
      data: {
        googleSub: identity.sub,
        email: identity.email,
        googleFirstName: identity.firstName,
        lastLoginAt: new Date(),
      },
      include: { profile: true },
    });
  }

  res.json({ token: signSessionToken(user), user: toSessionUser(user) });
}

async function me(req, res) {
  res.json(toSessionUser(req.user));
}

// Le JWT est sans état : se déconnecter, c'est l'oublier côté front.
// La route existe pour que le front ait un point d'appel stable.
async function logout(req, res) {
  res.status(204).end();
}

module.exports = { google, me, logout };
