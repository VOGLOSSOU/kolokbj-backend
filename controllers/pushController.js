const prisma = require('../lib/prisma');
const { env } = require('../config/env');
const { enabled } = require('../services/notificationService');

/** Clé publique VAPID, nécessaire au front pour s'abonner aux notifications. */
async function publicKey(req, res) {
  res.json({ enabled, publicKey: enabled ? env.vapid.publicKey : null });
}

/** Enregistre l'abonnement push de cet appareil (un appareil = un endpoint). */
async function subscribe(req, res) {
  const { endpoint, keys } = req.body;
  const data = { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth };

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...data },
    update: data,
  });

  res.status(204).end();
}

async function unsubscribe(req, res) {
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: req.body.endpoint, userId: req.user.id },
  });
  res.status(204).end();
}

module.exports = { publicKey, subscribe, unsubscribe };
