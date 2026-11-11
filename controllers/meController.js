const prisma = require('../lib/prisma');
const { assertNotBanned } = require('../services/banService');
const { toSessionUser, toOwnProfile, profileInputToColumns } = require('../utils/serializers');
const AppError = require('../utils/AppError');

const WHATSAPP_TAKEN = 'Ce numéro WhatsApp est déjà utilisé par un autre compte.';

// Modifier l'un de ces champs sur un profil validé le renvoie en validation :
// sinon un agent pourrait se faire valider puis changer d'identité.
const REVIEWED_FIELDS = ['firstName', 'photoUrl', 'gender', 'isStudent', 'university', 'campus', 'fieldOfStudy'];

/** Étape juste après la première connexion : numéro WhatsApp et acceptation des conditions. */
async function onboarding(req, res) {
  const { whatsapp } = req.body;

  if (whatsapp !== req.user.whatsapp) {
    await assertNotBanned([{ kind: 'WHATSAPP', value: whatsapp }]);
    const owner = await prisma.user.findUnique({ where: { whatsapp }, select: { id: true } });
    if (owner && owner.id !== req.user.id) throw AppError.conflict(WHATSAPP_TAKEN, 'WHATSAPP_TAKEN');
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: req.user.id },
      data: { whatsapp, termsAcceptedAt: req.user.termsAcceptedAt ?? new Date() },
      include: { profile: true },
    });
  } catch (error) {
    // Deux comptes qui prennent le même numéro au même instant
    if (error.code === 'P2002') throw AppError.conflict(WHATSAPP_TAKEN, 'WHATSAPP_TAKEN');
    throw error;
  }

  res.json(toSessionUser(user));
}

async function getProfile(req, res) {
  if (!req.user.profile) throw AppError.notFound("Tu n'as pas encore rempli ton profil.", 'PROFILE_NOT_FOUND');
  res.json(toOwnProfile(req.user.profile));
}

/** Crée ou remplace le profil colocataire, et le met dans la file de validation si besoin. */
async function saveProfile(req, res) {
  const columns = profileInputToColumns(req.body);
  const current = req.user.profile;

  const identityChanged = current && REVIEWED_FIELDS.some((field) => columns[field] !== current[field]);
  const needsReview =
    req.user.profileStatus === null ||
    req.user.profileStatus === 'REJECTED' ||
    (req.user.profileStatus === 'APPROVED' && identityChanged);

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      profile: { upsert: { create: columns, update: columns } },
      ...(needsReview && {
        profileStatus: 'PENDING',
        rejectionReason: null,
        profileSubmittedAt: new Date(),
      }),
    },
    include: { profile: true },
  });

  res.json({ user: toSessionUser(user), profile: toOwnProfile(user.profile) });
}

/** Se retirer de la recherche (coloc trouvée ailleurs) ou y revenir. */
async function setSearching(req, res) {
  const profile = await prisma.profile.update({
    where: { userId: req.user.id },
    data: { searching: req.body.searching },
  });
  res.json(toOwnProfile(profile));
}

/**
 * "Supprimer mon compte" : efface toutes les données personnelles (profil, demandes,
 * signalements, abonnements push partent en cascade). Si le compte était banni,
 * seules ses empreintes restent, pour bloquer une réinscription.
 */
async function deleteAccount(req, res) {
  const { id } = req.user;

  await prisma.$transaction([
    prisma.colocation.updateMany({ where: { userAId: id }, data: { userAId: null } }),
    prisma.colocation.updateMany({ where: { userBId: id }, data: { userBId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);

  res.status(204).end();
}

module.exports = { onboarding, getProfile, saveProfile, setSearching, deleteAccount };
