const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { FOLLOW_UP_DELAY_DAYS } = require('../config/constants');
const { DAY_MS } = require('../services/connectionService');
const { notify } = require('../services/notificationService');

/**
 * Relance "Vous êtes en coloc ?" : 7 jours après l'acceptation d'une demande,
 * une notification est envoyée aux deux étudiants. La question elle-même est
 * portée par l'API (champ coloc.askNow des demandes), la notification n'est qu'un rappel.
 */
async function sendColocFollowUps(now = new Date()) {
  const due = await prisma.connectionRequest.findMany({
    where: {
      status: 'ACCEPTED',
      followUpSentAt: null,
      colocation: null,
      respondedAt: { lte: new Date(now.getTime() - FOLLOW_UP_DELAY_DAYS * DAY_MS) },
    },
    select: { id: true, senderId: true, receiverId: true },
    take: 500,
  });

  for (const request of due) {
    // On marque d'abord : si deux instances tournent, une seule envoie
    const { count } = await prisma.connectionRequest.updateMany({
      where: { id: request.id, followUpSentAt: null },
      data: { followUpSentAt: now },
    });
    if (count === 0) continue;

    const message = {
      title: 'Vous êtes en coloc ?',
      body: 'Dis-nous si vous avez décidé de vous loger ensemble.',
      path: '/demandes',
    };
    await Promise.all([notify(request.senderId, message), notify(request.receiverId, message)]);
  }

  return due.length;
}

function startScheduler() {
  // Toutes les heures, à la minute 5
  cron.schedule('5 * * * *', () => {
    sendColocFollowUps().catch((error) => console.error('Relance coloc :', error.message));
  });
  console.log('Tâches planifiées démarrées');
}

module.exports = { startScheduler, sendColocFollowUps };
