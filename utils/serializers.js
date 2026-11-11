const { env } = require('../config/env');
const { whatsappLink } = require('./phone');

// Les admins sont désignés par leur adresse Google (ADMIN_EMAILS) : retirer une
// adresse de la liste retire l'accès immédiatement, sans toucher à la base.
function isAdmin(user) {
  return env.adminEmails.includes(user.email.toLowerCase());
}

/** L'utilisateur connecté, tel qu'attendu par le front (type SessionUser). */
function toSessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: isAdmin(user) ? 'ADMIN' : 'USER',
    firstName: user.profile?.firstName ?? user.googleFirstName ?? null,
    photoUrl: user.profile?.photoUrl ?? null,
    whatsapp: user.whatsapp,
    termsAcceptedAt: user.termsAcceptedAt,
    profileStatus: user.profileStatus,
    rejectionReason: user.profileStatus === 'REJECTED' ? user.rejectionReason : null,
  };
}

const dateOnly = (date) => (date ? date.toISOString().slice(0, 10) : null);

/** Profil colocataire tel que vu par les autres étudiants : ni email, ni numéro. */
function toProfile(profile) {
  return {
    id: profile.userId,
    firstName: profile.firstName,
    photoUrl: profile.photoUrl,
    age: profile.age,
    gender: profile.gender,
    isStudent: profile.isStudent,
    university: profile.university,
    campus: profile.campus,
    fieldOfStudy: profile.fieldOfStudy,
    studyYear: profile.studyYear,
    situation: profile.situation,
    housing:
      profile.situation === 'HAS_HOUSING'
        ? {
            neighborhood: profile.housingNeighborhood,
            type: profile.housingType,
            totalRent: profile.housingTotalRent,
            shareAsked: profile.housingShareAsked,
            availableFrom: dateOnly(profile.housingAvailableFrom),
          }
        : null,
    maxBudget: profile.maxBudget,
    preferredNeighborhoods: profile.preferredNeighborhoods,
    genderPreference: profile.genderPreference,
    lifestyle: {
      wakeTime: profile.wakeTime,
      sleepTime: profile.sleepTime,
      studyTime: profile.studyTime,
      guestsFrequency: profile.guestsFrequency,
      cleanliness: profile.cleanliness,
      smoker: profile.smoker,
    },
    bio: profile.bio,
  };
}

/** Son propre profil : le profil public, plus ce qui ne regarde que soi. */
function toOwnProfile(profile) {
  return { ...toProfile(profile), searching: profile.searching };
}

/** Corps de requête validé (objets imbriqués) vers les colonnes de la table Profile. */
function profileInputToColumns(input) {
  const hasHousing = input.situation === 'HAS_HOUSING';
  const housing = hasHousing ? input.housing : null;

  return {
    firstName: input.firstName,
    photoUrl: input.photoUrl,
    age: input.age,
    gender: input.gender,
    isStudent: input.isStudent,
    university: input.university ?? null,
    campus: input.campus ?? null,
    fieldOfStudy: input.fieldOfStudy ?? null,
    studyYear: input.studyYear ?? null,
    situation: input.situation,
    housingNeighborhood: housing?.neighborhood ?? null,
    housingType: housing?.type ?? null,
    housingTotalRent: housing?.totalRent ?? null,
    housingShareAsked: housing?.shareAsked ?? null,
    housingAvailableFrom: housing?.availableFrom ? new Date(housing.availableFrom) : null,
    maxBudget: hasHousing ? null : input.maxBudget,
    preferredNeighborhoods: hasHousing ? [] : input.preferredNeighborhoods,
    genderPreference: input.genderPreference,
    wakeTime: input.lifestyle.wakeTime,
    sleepTime: input.lifestyle.sleepTime,
    studyTime: input.lifestyle.studyTime,
    guestsFrequency: input.lifestyle.guestsFrequency,
    cleanliness: input.lifestyle.cleanliness,
    smoker: input.lifestyle.smoker,
    bio: input.bio ?? null,
  };
}

/** Vue admin d'un compte : tout ce qu'il faut pour valider ou sanctionner. */
function toAdminUser(user) {
  return {
    id: user.id,
    email: user.email,
    whatsapp: user.whatsapp,
    whatsappLink: user.whatsapp ? whatsappLink(user.whatsapp) : null,
    profileStatus: user.profileStatus,
    rejectionReason: user.rejectionReason,
    sanctionReason: user.sanctionReason,
    approvedAt: user.approvedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: user.profile ? toOwnProfile(user.profile) : null,
  };
}

module.exports = {
  isAdmin,
  toSessionUser,
  toProfile,
  toOwnProfile,
  profileInputToColumns,
  toAdminUser,
};
