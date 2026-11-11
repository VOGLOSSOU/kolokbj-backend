const { z, text, optionalText } = require('./common');
const {
  NEIGHBORHOOD_IDS,
  HOUSING_TYPES,
  STUDY_YEARS,
  STUDY_TIMES,
  GUESTS_FREQUENCIES,
} = require('../config/constants');

const neighborhood = z.enum(NEIGHBORHOOD_IDS);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM.');
// Montants en FCFA, sans centimes
const amount = z.number().int().min(1000).max(1_000_000);

const housing = z
  .object({
    neighborhood,
    type: z.enum(HOUSING_TYPES.map((t) => t.id)),
    totalRent: amount,
    shareAsked: amount,
    // Date au format AAAA-MM-JJ
    availableFrom: z.iso.date(),
  })
  .refine((value) => value.shareAsked <= value.totalRent, {
    path: ['shareAsked'],
    message: 'La part demandée ne peut pas dépasser le loyer total.',
  });

const lifestyle = z.object({
  wakeTime: time,
  sleepTime: time,
  studyTime: z.enum(STUDY_TIMES),
  guestsFrequency: z.enum(GUESTS_FREQUENCIES),
  cleanliness: z.number().int().min(1).max(5),
  smoker: z.boolean(),
});

const required = (ctx, path, message) => ctx.addIssue({ code: 'custom', path, message });

const save = z
  .object({
    firstName: text(40),
    // La photo est hébergée ailleurs : l'API ne garde que son adresse
    photoUrl: z.url({ protocol: /^https$/, error: 'La photo doit être une adresse https valide.' }).max(2000),
    age: z.number().int().min(16).max(60),
    gender: z.enum(['MALE', 'FEMALE']),
    isStudent: z.boolean().default(true),
    university: optionalText(120),
    campus: optionalText(120),
    fieldOfStudy: optionalText(120),
    studyYear: z.enum(STUDY_YEARS).nullish(),

    situation: z.enum(['HAS_HOUSING', 'SEEKING']),
    housing: housing.nullish(),
    maxBudget: amount.nullish(),
    preferredNeighborhoods: z.array(neighborhood).max(NEIGHBORHOOD_IDS.length).default([]),
    genderPreference: z.enum(['SAME_ONLY', 'ANY']),

    lifestyle,
    bio: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.isStudent) {
      if (!value.university) required(ctx, ['university'], 'Indique ton université.');
      if (!value.fieldOfStudy) required(ctx, ['fieldOfStudy'], 'Indique ta filière.');
      if (!value.studyYear) required(ctx, ['studyYear'], "Indique ton année d'étude.");
    }

    if (value.situation === 'HAS_HOUSING') {
      if (!value.housing) required(ctx, ['housing'], 'Décris ton logement.');
    } else {
      if (!value.maxBudget) required(ctx, ['maxBudget'], 'Indique ton budget maximum.');
      if (value.preferredNeighborhoods.length === 0) {
        required(ctx, ['preferredNeighborhoods'], 'Choisis au moins un quartier.');
      }
    }
  })
  .transform((value) => ({
    ...value,
    preferredNeighborhoods: [...new Set(value.preferredNeighborhoods)],
  }));

const searching = z.object({ searching: z.boolean() });

module.exports = { save, searching, neighborhood };
