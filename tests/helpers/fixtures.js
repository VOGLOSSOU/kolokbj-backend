const lifestyle = {
  wakeTime: '06:30',
  sleepTime: '23:00',
  studyTime: 'NIGHT',
  guestsFrequency: 'RARELY',
  cleanliness: 4,
  smoker: false,
};

/** Corps de PUT /me/profile pour un étudiant qui cherche un coloc pour louer ensemble. */
function seekerInput(overrides = {}) {
  return {
    firstName: 'Koffi',
    photoUrl: 'https://photos.test.dev/koffi.webp',
    age: 20,
    gender: 'MALE',
    university: 'UAC',
    campus: 'Abomey-Calavi',
    fieldOfStudy: 'Informatique',
    studyYear: 'L2',
    situation: 'SEEKING',
    maxBudget: 15000,
    preferredNeighborhoods: ['zogbadje', 'tankpe'],
    genderPreference: 'SAME_ONLY',
    lifestyle,
    bio: 'Calme, je révise surtout la nuit.',
    ...overrides,
  };
}

/** Corps de PUT /me/profile pour un étudiant qui a déjà un logement. */
function hostInput(overrides = {}) {
  return seekerInput({
    firstName: 'Arsène',
    photoUrl: 'https://photos.test.dev/arsene.webp',
    situation: 'HAS_HOUSING',
    housing: {
      neighborhood: 'zogbadje',
      type: 'CHAMBRE_SALON',
      totalRent: 27000,
      shareAsked: 13500,
      availableFrom: '2026-12-01',
    },
    maxBudget: undefined,
    preferredNeighborhoods: [],
    ...overrides,
  });
}

/** Ligne de la table Profile (colonnes à plat), pour tester le matching sans base. */
function profileRow(overrides = {}) {
  return {
    userId: 'u1',
    gender: 'MALE',
    genderPreference: 'ANY',
    situation: 'SEEKING',
    maxBudget: 15000,
    preferredNeighborhoods: ['zogbadje'],
    housingNeighborhood: null,
    housingShareAsked: null,
    ...lifestyle,
    ...overrides,
  };
}

module.exports = { seekerInput, hostInput, profileRow };
