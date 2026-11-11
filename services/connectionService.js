const prisma = require('../lib/prisma');
const { FOLLOW_UP_DELAY_DAYS } = require('../config/constants');
const { compatibilityScore } = require('./matchingService');
const { toProfile } = require('../utils/serializers');
const { whatsappLink } = require('../utils/phone');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date à partir de laquelle on demande "Vous êtes en coloc ?". */
function followUpDate(request) {
  return new Date(request.respondedAt.getTime() + FOLLOW_UP_DELAY_DAYS * DAY_MS);
}

/** Les deux sens d'une paire d'utilisateurs, pour un filtre Prisma. */
const between = (userId, otherIds) => [
  { senderId: userId, receiverId: { in: otherIds } },
  { senderId: { in: otherIds }, receiverId: userId },
];

/**
 * Pour chaque profil affiché, où en est la mise en relation avec moi.
 * Renvoie une Map otherId -> { id, status, direction } (la demande la plus récente).
 */
async function connectionsWith(userId, otherIds) {
  if (otherIds.length === 0) return new Map();

  const requests = await prisma.connectionRequest.findMany({
    where: { OR: between(userId, otherIds) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, senderId: true, receiverId: true },
  });

  const map = new Map();
  for (const request of requests) {
    const sent = request.senderId === userId;
    map.set(sent ? request.receiverId : request.senderId, {
      id: request.id,
      status: request.status,
      direction: sent ? 'SENT' : 'RECEIVED',
    });
  }
  return map;
}

/**
 * Une demande telle que la voit `viewer` (l'un des deux participants).
 * Le numéro WhatsApp de l'autre n'apparaît qu'une fois la demande acceptée.
 * `request` doit inclure sender et receiver (avec leur profil) et colocation.
 */
function toRequestItem(request, viewer, now = new Date()) {
  const sent = request.senderId === viewer.id;
  const other = sent ? request.receiver : request.sender;
  const accepted = request.status === 'ACCEPTED';
  const myAnswer = sent ? request.senderInColoc : request.receiverInColoc;
  const confirmed = Boolean(request.colocation);

  return {
    id: request.id,
    direction: sent ? 'SENT' : 'RECEIVED',
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt,
    profile: toProfile(other.profile),
    score: compatibilityScore(viewer.profile, other.profile).score,
    contact: accepted
      ? { whatsapp: other.whatsapp, whatsappLink: whatsappLink(other.whatsapp) }
      : null,
    coloc: accepted
      ? {
          // true : le front doit poser la question "Vous êtes en coloc ?"
          askNow: !confirmed && myAnswer === null && now >= followUpDate(request),
          myAnswer,
          confirmed,
        }
      : null,
  };
}

const REQUEST_INCLUDE = {
  sender: { include: { profile: true } },
  receiver: { include: { profile: true } },
  colocation: true,
};

module.exports = { DAY_MS, followUpDate, between, connectionsWith, toRequestItem, REQUEST_INCLUDE };
