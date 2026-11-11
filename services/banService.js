const prisma = require('../lib/prisma');
const { fingerprint } = require('../utils/hash');
const AppError = require('../utils/AppError');

/*
 * Un banni ne doit pas pouvoir se réinscrire, même après avoir supprimé son compte.
 * On garde donc l'empreinte de son compte Google, de son email et de son numéro
 * WhatsApp : assez pour le reconnaître, sans conserver ses données.
 */

const identitiesOf = (user) =>
  [
    { kind: 'GOOGLE_SUB', value: user.googleSub },
    { kind: 'EMAIL', value: user.email },
    { kind: 'WHATSAPP', value: user.whatsapp },
  ].filter((identity) => identity.value);

/** Lève une erreur si l'un des identifiants appartient à un compte banni. */
async function assertNotBanned(identities) {
  const banned = await prisma.bannedIdentity.findFirst({
    where: { OR: identities.map(({ kind, value }) => ({ kind, hash: fingerprint(value) })) },
    select: { id: true },
  });
  if (banned) {
    throw AppError.forbidden("Ce compte a été banni de Kolok. L'inscription est impossible.", 'ACCOUNT_BANNED');
  }
}

/** Enregistre les empreintes d'un compte banni. `tx` : transaction Prisma en cours. */
async function banIdentities(tx, user) {
  await tx.bannedIdentity.createMany({
    data: identitiesOf(user).map(({ kind, value }) => ({
      kind,
      hash: fingerprint(value),
      userId: user.id,
    })),
    skipDuplicates: true,
  });
}

async function unbanIdentities(tx, user) {
  await tx.bannedIdentity.deleteMany({
    where: {
      OR: [
        { userId: user.id },
        ...identitiesOf(user).map(({ kind, value }) => ({ kind, hash: fingerprint(value) })),
      ],
    },
  });
}

module.exports = { assertNotBanned, banIdentities, unbanIdentities };
