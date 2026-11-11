const prisma = require('../lib/prisma');
const { MATCHING, GUESTS_FREQUENCIES } = require('../config/constants');

/*
 * Matching du MVP : des règles simples, pas d'IA.
 *  1. Filtres bloquants (situation, budget, quartier, sexe) : un profil qui en rate un n'est pas proposé.
 *  2. Score sur 100 calculé sur le rythme de vie, pour trier ceux qui restent.
 * Les fonctions de calcul sont pures (aucun accès base) : elles se testent seules.
 */

const hasHousing = (profile) => profile.situation === 'HAS_HOUSING';

/** Quartiers où ce profil peut habiter : celui de son logement, ou ceux qu'il vise. */
function neighborhoodsOf(profile) {
  return hasHousing(profile) ? [profile.housingNeighborhood] : profile.preferredNeighborhoods;
}

/**
 * Liste des filtres bloquants ratés entre deux profils (vide = compatibles).
 * La règle est symétrique : si A peut voir B, B peut voir A.
 */
function hardFilterFailures(a, b) {
  const failures = [];

  if (hasHousing(a) && hasHousing(b)) {
    // Chacun a déjà son logement à partager : rien à faire ensemble
    failures.push('SITUATION');
  } else if (hasHousing(a) || hasHousing(b)) {
    const [host, seeker] = hasHousing(a) ? [a, b] : [b, a];
    if (host.housingShareAsked > seeker.maxBudget) failures.push('BUDGET');
  } else {
    const low = Math.min(a.maxBudget, b.maxBudget);
    const high = Math.max(a.maxBudget, b.maxBudget);
    if (low < high * MATCHING.seekersBudgetRatio) failures.push('BUDGET');
  }

  const mine = neighborhoodsOf(a);
  if (!neighborhoodsOf(b).some((n) => mine.includes(n))) failures.push('NEIGHBORHOOD');

  const sameOnly = a.genderPreference === 'SAME_ONLY' || b.genderPreference === 'SAME_ONLY';
  if (sameOnly && a.gender !== b.gender) failures.push('GENDER');

  return failures;
}

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** 1 si les deux horaires sont identiques, 0 à partir de maxTimeGapMinutes d'écart. */
function timeCloseness(a, b) {
  const diff = Math.abs(toMinutes(a) - toMinutes(b));
  const gap = Math.min(diff, 24 * 60 - diff); // 23:30 et 00:30 sont à 1 h, pas à 23 h
  return Math.max(0, 1 - gap / MATCHING.maxTimeGapMinutes);
}

function studyCloseness(a, b) {
  if (a === b) return 1;
  if (a === 'FLEXIBLE' || b === 'FLEXIBLE') return 0.7;
  return 0;
}

function guestsCloseness(a, b) {
  const gap = Math.abs(GUESTS_FREQUENCIES.indexOf(a) - GUESTS_FREQUENCIES.indexOf(b));
  return 1 - gap / (GUESTS_FREQUENCIES.length - 1);
}

/**
 * Score de compatibilité sur 100, calculé sur le rythme de vie.
 * `breakdown` détaille les points par critère, pour que le front puisse montrer ce qui colle.
 */
function compatibilityScore(a, b) {
  const closeness = {
    sleepTime: timeCloseness(a.sleepTime, b.sleepTime),
    wakeTime: timeCloseness(a.wakeTime, b.wakeTime),
    studyTime: studyCloseness(a.studyTime, b.studyTime),
    guestsFrequency: guestsCloseness(a.guestsFrequency, b.guestsFrequency),
    cleanliness: 1 - Math.abs(a.cleanliness - b.cleanliness) / 4,
    smoker: a.smoker === b.smoker ? 1 : 0,
  };

  const breakdown = Object.entries(MATCHING.weights).map(([criterion, max]) => ({
    criterion,
    points: Math.round(closeness[criterion] * max),
    max,
  }));

  return { score: breakdown.reduce((total, item) => total + item.points, 0), breakdown };
}

/** Ids des comptes avec qui il y a un signalement, dans un sens ou dans l'autre. */
async function reportedCounterpartIds(userId) {
  const reports = await prisma.report.findMany({
    where: { OR: [{ reporterId: userId }, { reportedId: userId }] },
    select: { reporterId: true, reportedId: true },
  });
  return [...new Set(reports.map((r) => (r.reporterId === userId ? r.reportedId : r.reporterId)))];
}

/**
 * Profils compatibles avec `me`, triés par score décroissant.
 * Le premier tri (statut, sexe, situation) est fait en SQL ; budget, quartier et score
 * sont calculés ici. Suffisant pour un campus ; à passer en SQL si le volume l'exige.
 */
async function findMatches(me, filters = {}) {
  const mine = me.profile;
  const excludedIds = [me.id, ...(await reportedCounterpartIds(me.id))];

  const candidates = await prisma.profile.findMany({
    where: {
      userId: { notIn: excludedIds },
      searching: true,
      user: { profileStatus: 'APPROVED' },
      ...(mine.genderPreference === 'SAME_ONLY'
        ? { gender: mine.gender }
        : { OR: [{ genderPreference: 'ANY' }, { gender: mine.gender }] }),
      ...(hasHousing(mine) && { situation: 'SEEKING' }),
      ...(filters.hasHousing !== undefined && {
        situation: filters.hasHousing ? 'HAS_HOUSING' : 'SEEKING',
      }),
    },
  });

  return candidates
    .filter((candidate) => hardFilterFailures(mine, candidate).length === 0)
    .filter((candidate) => {
      if (filters.neighborhood && !neighborhoodsOf(candidate).includes(filters.neighborhood)) {
        return false;
      }
      if (filters.maxBudget !== undefined) {
        const cost = hasHousing(candidate) ? candidate.housingShareAsked : candidate.maxBudget;
        if (cost > filters.maxBudget) return false;
      }
      return true;
    })
    .map((candidate) => ({ profile: candidate, ...compatibilityScore(mine, candidate) }))
    .sort((x, y) => y.score - x.score || y.profile.updatedAt - x.profile.updatedAt);
}

module.exports = {
  neighborhoodsOf,
  hardFilterFailures,
  compatibilityScore,
  findMatches,
};
