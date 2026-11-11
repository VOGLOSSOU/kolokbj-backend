const webpush = require('web-push');
const prisma = require('../lib/prisma');
const { env } = require('../config/env');

const enabled = Boolean(env.vapid.publicKey && env.vapid.privateKey && env.vapid.subject);

if (enabled) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
}

/**
 * Envoie une notification Web Push sur tous les appareils d'un utilisateur.
 * Ne lève jamais d'erreur : une notification ratée ne doit pas faire échouer l'action.
 * `path` est le chemin du front à ouvrir au clic (ex. "/demandes").
 */
async function notify(userId, { title, body, path = '/' }) {
  if (!enabled) return;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    const payload = JSON.stringify({ title, body, url: `${env.appUrl}${path}` });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          // 404 / 410 : l'abonnement n'existe plus (appli désinstallée, permission retirée)
          if (error.statusCode === 404 || error.statusCode === 410) {
            await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          } else {
            console.error('Web Push : envoi impossible', error.statusCode || error.message);
          }
        }
      }),
    );
  } catch (error) {
    console.error('Web Push : erreur inattendue', error.message);
  }
}

module.exports = { notify, enabled };
