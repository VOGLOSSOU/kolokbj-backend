const prisma = require('../lib/prisma');
const { DAILY_REQUEST_LIMIT } = require('../config/constants');
const { hardFilterFailures } = require('../services/matchingService');
const { DAY_MS, between, toRequestItem, REQUEST_INCLUDE } = require('../services/connectionService');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');

const requestNotFound = () => AppError.notFound('Cette demande est introuvable.', 'REQUEST_NOT_FOUND');

const sentSince24h = (userId) =>
  prisma.connectionRequest.count({
    where: { senderId: userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
  });

/** "Proposer une coloc" : envoie une demande de mise en relation à un profil compatible. */
async function create(req, res) {
  const me = req.user;
  const { toUserId, message } = req.body;
  const profileNotFound = AppError.notFound('Ce profil est introuvable.', 'PROFILE_NOT_FOUND');

  if (toUserId === me.id) throw AppError.badRequest('Tu ne peux pas te proposer une coloc à toi-même.');
  if (!me.profile.searching) {
    throw AppError.conflict(
      "Ton profil n'est plus dans la recherche. Réactive-le pour proposer une coloc.",
      'NOT_SEARCHING',
    );
  }

  const target = await prisma.user.findUnique({ where: { id: toUserId }, include: { profile: true } });
  if (!target?.profile || target.profileStatus !== 'APPROVED' || !target.profile.searching) {
    throw profileNotFound;
  }
  if (hardFilterFailures(me.profile, target.profile).length > 0) throw profileNotFound;

  const reported = await prisma.report.findFirst({
    where: {
      OR: [
        { reporterId: me.id, reportedId: target.id },
        { reporterId: target.id, reportedId: me.id },
      ],
    },
    select: { id: true },
  });
  if (reported) throw profileNotFound;

  const existing = await prisma.connectionRequest.findFirst({
    where: { OR: between(me.id, [target.id]), status: { in: ['PENDING', 'ACCEPTED', 'DECLINED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.status === 'ACCEPTED') {
    throw AppError.conflict('Vous êtes déjà en relation.', 'ALREADY_CONNECTED');
  }
  if (existing?.status === 'PENDING') {
    throw existing.senderId === me.id
      ? AppError.conflict('Tu as déjà envoyé une demande à ce profil.', 'REQUEST_ALREADY_SENT')
      : AppError.conflict("Ce profil t'a déjà envoyé une demande : réponds-lui.", 'REQUEST_ALREADY_RECEIVED');
  }
  // Un refus est définitif dans ce sens : on ne relance pas quelqu'un qui a dit non
  if (existing?.status === 'DECLINED' && existing.senderId === me.id) {
    throw AppError.conflict("Ce profil n'a pas donné suite à ta demande.", 'REQUEST_DECLINED');
  }

  if ((await sentSince24h(me.id)) >= DAILY_REQUEST_LIMIT) {
    throw AppError.tooMany(
      `Tu as atteint la limite de ${DAILY_REQUEST_LIMIT} demandes par jour. Reviens demain.`,
      'DAILY_LIMIT_REACHED',
    );
  }

  const request = await prisma.connectionRequest.create({
    data: { senderId: me.id, receiverId: target.id, message },
    include: REQUEST_INCLUDE,
  });

  notify(target.id, {
    title: 'Nouvelle demande de coloc',
    body: `${me.profile.firstName} te propose une coloc.`,
    path: '/demandes',
  });

  res.status(201).json(toRequestItem(request, me));
}

/** Mes demandes, envoyées et reçues, les plus récentes d'abord. */
async function list(req, res) {
  const me = req.user;
  const { direction, status } = req.query;

  // On masque les demandes dont l'autre participant a été suspendu ou banni
  const visible = { profileStatus: { notIn: ['SUSPENDED', 'BANNED'] }, profile: { isNot: null } };
  const sent = { senderId: me.id, receiver: visible };
  const received = { receiverId: me.id, sender: visible };

  const [requests, sentToday] = await Promise.all([
    prisma.connectionRequest.findMany({
      where: {
        OR: direction === 'sent' ? [sent] : direction === 'received' ? [received] : [sent, received],
        ...(status && { status }),
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    sentSince24h(me.id),
  ]);

  res.json({
    items: requests.map((request) => toRequestItem(request, me)),
    quota: { limit: DAILY_REQUEST_LIMIT, remaining: Math.max(0, DAILY_REQUEST_LIMIT - sentToday) },
  });
}

/** Passe une demande reçue de PENDING à `status`, de façon atomique. */
async function respond(req, status) {
  const { count } = await prisma.connectionRequest.updateMany({
    where: { id: req.params.id, receiverId: req.user.id, status: 'PENDING' },
    data: { status, respondedAt: new Date() },
  });
  if (count === 0) throw requestNotFound();

  return prisma.connectionRequest.findUnique({
    where: { id: req.params.id },
    include: REQUEST_INCLUDE,
  });
}

/** Accepter : les deux numéros WhatsApp sont dévoilés l'un à l'autre. */
async function accept(req, res) {
  const request = await respond(req, 'ACCEPTED');

  notify(request.senderId, {
    title: 'Demande acceptée',
    body: `${req.user.profile.firstName} a accepté ta proposition de coloc. Écris-lui sur WhatsApp.`,
    path: '/demandes',
  });

  res.json(toRequestItem(request, req.user));
}

async function decline(req, res) {
  const request = await respond(req, 'DECLINED');
  res.json(toRequestItem(request, req.user));
}

/** Annuler une demande envoyée, tant qu'elle n'a pas reçu de réponse. */
async function cancel(req, res) {
  const { count } = await prisma.connectionRequest.updateMany({
    where: { id: req.params.id, senderId: req.user.id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) throw requestNotFound();

  res.status(204).end();
}

/**
 * Réponse à "Vous êtes en coloc ?". Quand les deux ont répondu oui, la coloc est
 * comptée, leurs profils sortent de la recherche et leurs autres demandes en attente sont closes.
 */
async function colocAnswer(req, res) {
  const me = req.user;
  const { inColoc } = req.body;

  const request = await prisma.$transaction(async (tx) => {
    const current = await tx.connectionRequest.findFirst({
      where: {
        id: req.params.id,
        status: 'ACCEPTED',
        OR: [{ senderId: me.id }, { receiverId: me.id }],
      },
      include: { colocation: true },
    });
    if (!current) throw requestNotFound();
    if (current.colocation) {
      throw AppError.conflict('Cette coloc est déjà confirmée.', 'COLOC_ALREADY_CONFIRMED');
    }

    const updated = await tx.connectionRequest.update({
      where: { id: current.id },
      data: current.senderId === me.id ? { senderInColoc: inColoc } : { receiverInColoc: inColoc },
      include: { colocation: true },
    });

    if (updated.senderInColoc && updated.receiverInColoc && !updated.colocation) {
      const pair = [updated.senderId, updated.receiverId];
      await tx.colocation.create({
        data: { requestId: updated.id, userAId: updated.senderId, userBId: updated.receiverId },
      });
      await tx.profile.updateMany({ where: { userId: { in: pair } }, data: { searching: false } });
      await tx.connectionRequest.updateMany({
        where: { status: 'PENDING', senderId: { in: pair } },
        data: { status: 'CANCELLED' },
      });
      await tx.connectionRequest.updateMany({
        where: { status: 'PENDING', receiverId: { in: pair } },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
    }

    return tx.connectionRequest.findUnique({ where: { id: current.id }, include: REQUEST_INCLUDE });
  });

  res.json(toRequestItem(request, me));
}

module.exports = { create, list, accept, decline, cancel, colocAnswer };
