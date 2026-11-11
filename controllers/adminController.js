const prisma = require('../lib/prisma');
const { banIdentities, unbanIdentities } = require('../services/banService');
const { notify } = require('../services/notificationService');
const { isAdmin, toAdminUser } = require('../utils/serializers');
const AppError = require('../utils/AppError');

const userNotFound = () => AppError.notFound('Compte introuvable.', 'USER_NOT_FOUND');

async function loadTarget(id) {
  const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) throw userNotFound();
  return user;
}

/** Applique un changement à un compte et l'inscrit au journal, dans la même transaction. */
function applyAction(admin, target, action, data, { reason, extra } = {}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: target.id },
      data,
      include: { profile: true },
    });
    await tx.adminAction.create({
      data: { adminId: admin.id, action, targetUserId: target.id, reason },
    });
    if (extra) await extra(tx);
    return user;
  });
}

/** Ferme les demandes en attente d'un compte sanctionné. */
async function closePendingRequests(tx, userId) {
  await tx.connectionRequest.updateMany({
    where: { status: 'PENDING', senderId: userId },
    data: { status: 'CANCELLED' },
  });
  await tx.connectionRequest.updateMany({
    where: { status: 'PENDING', receiverId: userId },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });
}

// ---------- Validation des profils ----------

/** File d'attente : par défaut les profils à valider, les plus anciens d'abord. */
async function listUsers(req, res) {
  const { page, limit, status } = req.query;
  const where = { profileStatus: status };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { profile: true },
      orderBy: { profileSubmittedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ items: users.map(toAdminUser), total, page, limit });
}

/** Fiche complète d'un compte : profil, signalements reçus, historique des actions admin. */
async function showUser(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      profile: true,
      reportsReceived: {
        orderBy: { createdAt: 'desc' },
        include: { reporter: { select: { id: true, email: true } } },
      },
      actionsReceived: {
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { id: true, email: true } } },
      },
      _count: { select: { reportsMade: true, sentRequests: true, receivedRequests: true } },
    },
  });
  if (!user) throw userNotFound();

  res.json({
    ...toAdminUser(user),
    counts: user._count,
    reports: user.reportsReceived.map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      reporter: report.reporter,
    })),
    history: user.actionsReceived.map((action) => ({
      id: action.id,
      action: action.action,
      reason: action.reason,
      createdAt: action.createdAt,
      admin: action.admin,
    })),
  });
}

async function approve(req, res) {
  const target = await loadTarget(req.params.id);
  if (target.profileStatus !== 'PENDING') {
    throw AppError.conflict("Ce profil n'est pas en attente de validation.", 'NOT_PENDING');
  }

  const user = await applyAction(req.user, target, 'APPROVE_PROFILE', {
    profileStatus: 'APPROVED',
    approvedAt: new Date(),
    rejectionReason: null,
  });

  notify(user.id, {
    title: 'Ton profil est validé',
    body: 'Tu peux maintenant découvrir les étudiants compatibles avec toi.',
    path: '/decouvrir',
  });

  res.json(toAdminUser(user));
}

/** Rejet avec motif : l'étudiant le voit et peut corriger son profil. */
async function reject(req, res) {
  const target = await loadTarget(req.params.id);
  if (target.profileStatus !== 'PENDING') {
    throw AppError.conflict("Ce profil n'est pas en attente de validation.", 'NOT_PENDING');
  }

  const { reason } = req.body;
  const user = await applyAction(
    req.user,
    target,
    'REJECT_PROFILE',
    { profileStatus: 'REJECTED', rejectionReason: reason },
    { reason },
  );

  notify(user.id, {
    title: "Ton profil n'a pas été validé",
    body: 'Regarde le motif et corrige ton profil.',
    path: '/profil-refuse',
  });

  res.json(toAdminUser(user));
}

// ---------- Sanctions ----------

function assertCanSanction(admin, target) {
  if (target.id === admin.id || isAdmin(target)) {
    throw AppError.forbidden('Un compte admin ne peut pas être sanctionné depuis le back-office.');
  }
}

async function suspend(req, res) {
  const target = await loadTarget(req.params.id);
  assertCanSanction(req.user, target);
  if (['SUSPENDED', 'BANNED'].includes(target.profileStatus)) {
    throw AppError.conflict('Ce compte est déjà suspendu ou banni.', 'ALREADY_SANCTIONED');
  }

  const { reason } = req.body;
  const user = await applyAction(
    req.user,
    target,
    'SUSPEND_USER',
    { profileStatus: 'SUSPENDED', sanctionReason: reason },
    { reason, extra: (tx) => closePendingRequests(tx, target.id) },
  );

  res.json(toAdminUser(user));
}

/** Bannissement définitif : le compte Google et le numéro WhatsApp ne pourront plus s'inscrire. */
async function ban(req, res) {
  const target = await loadTarget(req.params.id);
  assertCanSanction(req.user, target);
  if (target.profileStatus === 'BANNED') {
    throw AppError.conflict('Ce compte est déjà banni.', 'ALREADY_SANCTIONED');
  }

  const { reason } = req.body;
  const user = await applyAction(
    req.user,
    target,
    'BAN_USER',
    { profileStatus: 'BANNED', sanctionReason: reason },
    {
      reason,
      extra: async (tx) => {
        await banIdentities(tx, target);
        await closePendingRequests(tx, target.id);
      },
    },
  );

  res.json(toAdminUser(user));
}

/** Rétablit un compte suspendu ou banni dans l'état où il était avant la sanction. */
async function restore(req, res) {
  const target = await loadTarget(req.params.id);
  if (!['SUSPENDED', 'BANNED'].includes(target.profileStatus)) {
    throw AppError.conflict("Ce compte n'est ni suspendu ni banni.", 'NOT_SANCTIONED');
  }

  let profileStatus = null;
  if (target.profile) profileStatus = target.approvedAt ? 'APPROVED' : 'PENDING';

  const user = await applyAction(
    req.user,
    target,
    'RESTORE_USER',
    {
      profileStatus,
      sanctionReason: null,
      ...(profileStatus === 'PENDING' && { profileSubmittedAt: new Date() }),
    },
    { extra: (tx) => unbanIdentities(tx, target) },
  );

  res.json(toAdminUser(user));
}

// ---------- Signalements ----------

const reportParty = { select: { id: true, email: true, profileStatus: true, profile: { select: { firstName: true, photoUrl: true } } } };

const toParty = (user) => ({
  id: user.id,
  email: user.email,
  profileStatus: user.profileStatus,
  firstName: user.profile?.firstName ?? null,
  photoUrl: user.profile?.photoUrl ?? null,
});

async function listReports(req, res) {
  const { page, limit, status } = req.query;
  const where = { status };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: { reporter: reportParty, reported: reportParty },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);

  // Nombre total de signalements reçus par chaque compte signalé : un récidiviste se voit tout de suite
  const counts = await prisma.report.groupBy({
    by: ['reportedId'],
    where: { reportedId: { in: reports.map((report) => report.reportedId) } },
    _count: { _all: true },
  });
  const countByUser = new Map(counts.map((row) => [row.reportedId, row._count._all]));

  res.json({
    items: reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      resolutionNote: report.resolutionNote,
      reporter: toParty(report.reporter),
      reported: { ...toParty(report.reported), reportsCount: countByUser.get(report.reportedId) ?? 0 },
    })),
    total,
    page,
    limit,
  });
}

/** Clôt un signalement. La sanction éventuelle se décide à part (suspendre / bannir). */
function closeReport(status, action) {
  return async (req, res) => {
    const { note } = req.body;

    const report = await prisma.$transaction(async (tx) => {
      const { count } = await tx.report.updateMany({
        where: { id: req.params.id, status: 'OPEN' },
        data: { status, resolvedAt: new Date(), resolutionNote: note },
      });
      if (count === 0) throw AppError.notFound('Signalement introuvable ou déjà traité.', 'REPORT_NOT_FOUND');

      const closed = await tx.report.findUnique({ where: { id: req.params.id } });
      await tx.adminAction.create({
        data: {
          adminId: req.user.id,
          action,
          targetUserId: closed.reportedId,
          reportId: closed.id,
          reason: note,
        },
      });
      return closed;
    });

    res.json({ id: report.id, status: report.status, resolvedAt: report.resolvedAt });
  };
}

// ---------- Tableau de bord et journal ----------

/** L'entonnoir : inscrits, vérifiés, demandes envoyées, acceptées, colocs confirmées. */
async function stats(req, res) {
  const [registered, byStatus, requestsSent, requestsAccepted, colocations, openReports] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['profileStatus'], _count: { _all: true } }),
      prisma.connectionRequest.count(),
      prisma.connectionRequest.count({ where: { status: 'ACCEPTED' } }),
      prisma.colocation.count(),
      prisma.report.count({ where: { status: 'OPEN' } }),
    ]);

  const count = (status) => byStatus.find((row) => row.profileStatus === status)?._count._all ?? 0;

  res.json({
    registered,
    approved: count('APPROVED'),
    pending: count('PENDING'),
    rejected: count('REJECTED'),
    suspended: count('SUSPENDED'),
    banned: count('BANNED'),
    requestsSent,
    requestsAccepted,
    colocations,
    openReports,
  });
}

/** Journal des actions admin : qui a validé, rejeté, banni, et quand. */
async function listActions(req, res) {
  const { page, limit } = req.query;
  const person = { select: { id: true, email: true } };

  const [actions, total] = await Promise.all([
    prisma.adminAction.findMany({
      include: { admin: person, targetUser: person },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAction.count(),
  ]);

  res.json({
    items: actions.map((action) => ({
      id: action.id,
      action: action.action,
      reason: action.reason,
      reportId: action.reportId,
      createdAt: action.createdAt,
      admin: action.admin,
      targetUser: action.targetUser,
    })),
    total,
    page,
    limit,
  });
}

module.exports = {
  listUsers,
  showUser,
  approve,
  reject,
  suspend,
  ban,
  restore,
  listReports,
  resolveReport: closeReport('RESOLVED', 'RESOLVE_REPORT'),
  dismissReport: closeReport('DISMISSED', 'DISMISS_REPORT'),
  stats,
  listActions,
};
