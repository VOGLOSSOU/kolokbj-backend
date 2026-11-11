// Quartiers proposés au lancement (autour de l'UAC). L'id est stocké en base,
// le label est affiché par le front. Pour ajouter un quartier : une ligne ici.
const NEIGHBORHOODS = [
  { id: 'zogbadje', label: 'Zogbadjè' },
  { id: 'bidossessi', label: 'Bidossessi' },
  { id: 'ita', label: 'ITA' },
  { id: 'tankpe', label: 'Tankpè' },
  { id: 'arconville', label: 'Arconville' },
  { id: 'houeto', label: 'Houèto' },
  { id: 'zoca', label: 'Zoca' },
  { id: 'kpota', label: 'Kpota' },
  { id: 'aitchedji', label: 'Aïtchédji' },
  { id: 'agori', label: 'Agori' },
  { id: 'togoudo', label: 'Togoudo' },
  { id: 'tokan', label: 'Tokan' },
  { id: 'calavi-centre', label: 'Calavi centre' },
];

const NEIGHBORHOOD_IDS = NEIGHBORHOODS.map((n) => n.id);

const HOUSING_TYPES = [
  { id: 'ENTREE_COUCHEE', label: 'Entrée-couchée' },
  { id: 'CHAMBRE_SALON', label: 'Chambre-salon' },
  { id: 'DEUX_CHAMBRES_SALON', label: 'Deux chambres-salon' },
  { id: 'TROIS_CHAMBRES_SALON', label: 'Trois chambres-salon' },
  { id: 'STUDIO', label: 'Studio' },
  { id: 'AUTRE', label: 'Autre' },
];

const STUDY_YEARS = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT', 'AUTRE'];
const STUDY_TIMES = ['DAY', 'NIGHT', 'FLEXIBLE'];
const GUESTS_FREQUENCIES = ['NEVER', 'RARELY', 'SOMETIMES', 'OFTEN'];

const REPORT_REASONS = [
  { id: 'AGENT', label: 'Agent ou démarcheur' },
  { id: 'SCAM', label: "Arnaque ou demande d'argent" },
  { id: 'FAKE_PROFILE', label: 'Faux profil' },
  { id: 'INAPPROPRIATE', label: 'Comportement inapproprié' },
  { id: 'OTHER', label: 'Autre' },
];

/** Demandes de mise en relation envoyées par 24 h glissantes. */
const DAILY_REQUEST_LIMIT = 10;

/** Délai avant la relance "Vous êtes en coloc ?". */
const FOLLOW_UP_DELAY_DAYS = 7;

const MATCHING = {
  // Poids du score de compatibilité (total = 100)
  weights: {
    sleepTime: 20,
    wakeTime: 15,
    studyTime: 15,
    guestsFrequency: 15,
    cleanliness: 20,
    smoker: 15,
  },
  // Écart d'horaire (en minutes) à partir duquel le critère rapporte 0
  maxTimeGapMinutes: 240,
  // Deux étudiants sans logement : le plus petit budget doit atteindre
  // au moins cette part du plus grand, sinon ils ne visent pas le même loyer
  seekersBudgetRatio: 0.5,
};

module.exports = {
  NEIGHBORHOODS,
  NEIGHBORHOOD_IDS,
  HOUSING_TYPES,
  STUDY_YEARS,
  STUDY_TIMES,
  GUESTS_FREQUENCIES,
  REPORT_REASONS,
  DAILY_REQUEST_LIMIT,
  FOLLOW_UP_DELAY_DAYS,
  MATCHING,
};
