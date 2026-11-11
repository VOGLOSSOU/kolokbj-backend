const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

/** Bouton "Signaler" d'un profil. Le signalement part dans la file des admins. */
async function create(req, res) {
  const { userId, reason, details } = req.body;

  if (userId === req.user.id) throw AppError.badRequest('Tu ne peux pas te signaler toi-même.');

  const reported = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!reported) throw AppError.notFound('Ce profil est introuvable.', 'PROFILE_NOT_FOUND');

  const open = await prisma.report.findFirst({
    where: { reporterId: req.user.id, reportedId: userId, status: 'OPEN' },
    select: { id: true },
  });
  if (open) {
    throw AppError.conflict("Tu as déjà signalé ce profil. L'équipe s'en occupe.", 'ALREADY_REPORTED');
  }

  const report = await prisma.report.create({
    data: { reporterId: req.user.id, reportedId: userId, reason, details },
  });

  res.status(201).json({ id: report.id, status: report.status, createdAt: report.createdAt });
}

module.exports = { create };
