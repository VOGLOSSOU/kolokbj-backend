const { z } = require('zod');
const { normalizeBeninPhone } = require('../utils/phone');

// Messages d'erreur de validation en français
z.config(z.locales.fr());

/** Numéro béninois, renvoyé au format +22901XXXXXXXX. */
const beninPhone = z.string().transform((value, ctx) => {
  const normalized = normalizeBeninPhone(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'Entre un numéro béninois valide (ex. 01 97 00 00 00).' });
    return z.NEVER;
  }
  return normalized;
});

/** Texte libre : espaces de bord retirés, chaîne vide refusée. */
const text = (max) => z.string().trim().min(1).max(max);

/** Texte libre facultatif : absent, null ou vide deviennent null. */
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/** Booléen passé dans l'URL (?hasHousing=true). */
const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

const reason = z.object({ reason: text(500) });

module.exports = { z, beninPhone, text, optionalText, queryBoolean, pagination, reason };
