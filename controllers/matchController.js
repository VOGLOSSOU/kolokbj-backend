const prisma = require('../lib/prisma');
const { findMatches, hardFilterFailures, compatibilityScore } = require('../services/matchingService');
const { connectionsWith } = require('../services/connectionService');
const { toProfile } = require('../utils/serializers');
const AppError = require('../utils/AppError');

/** Liste des étudiants compatibles, triés par score, avec filtres simples. */
async function list(req, res) {
  const { page, limit, ...filters } = req.query;

  const matches = await findMatches(req.user, filters);
  const pageItems = matches.slice((page - 1) * limit, page * limit);
  const connections = await connectionsWith(
    req.user.id,
    pageItems.map((match) => match.profile.userId),
  );

  res.json({
    items: pageItems.map((match) => ({
      profile: toProfile(match.profile),
      score: match.score,
      connection: connections.get(match.profile.userId) ?? null,
    })),
    total: matches.length,
    page,
    limit,
  });
}

/**
 * Détail d'un profil. Visible seulement s'il est compatible avec moi, ou si une
 * demande existe déjà entre nous : on ne consulte pas un profil qu'on ne peut pas contacter.
 */
async function show(req, res) {
  const notFound = AppError.notFound('Ce profil est introuvable.', 'PROFILE_NOT_FOUND');

  const target = await prisma.user.findUnique({
    where: { id: req.params.userId },
    include: { profile: true },
  });
  if (!target?.profile || target.profileStatus !== 'APPROVED') throw notFound;

  const isSelf = target.id === req.user.id;
  const failures = isSelf ? [] : hardFilterFailures(req.user.profile, target.profile);
  const connection = (await connectionsWith(req.user.id, [target.id])).get(target.id) ?? null;
  if (failures.length > 0 && !connection) throw notFound;

  const { score, breakdown } = compatibilityScore(req.user.profile, target.profile);

  res.json({
    profile: toProfile(target.profile),
    score: isSelf ? null : score,
    breakdown: isSelf ? null : breakdown,
    connection,
    // false : le profil est sorti de la recherche ou n'est plus compatible
    canRequest: !isSelf && failures.length === 0 && target.profile.searching && !connection,
  });
}

module.exports = { list, show };
