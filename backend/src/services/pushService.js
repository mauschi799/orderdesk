const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Configure VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@gasdispo.local';

let vapidConfigured = false;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
    console.log('✅ Web Push VAPID konfiguriert');
  } catch (err) {
    console.warn('⚠️  VAPID Konfigurationsfehler:', err.message);
  }
} else {
  console.warn('⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY nicht gesetzt – Push-Notifications deaktiviert');
}

/**
 * Send a push notification to all active subscribers of a user (or all users)
 * @param {Object} options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {string} options.icon - Icon path
 * @param {string} options.tag - Notification tag (for deduplication)
 * @param {Object} options.data - Extra data sent to service worker
 * @param {string|null} options.userId - If null, send to all subscribers
 * @param {string|null} options.eventType - e.g. 'statusGeaendert'
 */
const sendPushNotification = async ({ title, body, icon = '/icon-192.png', tag, data = {}, userId = null, eventType = null }) => {
  if (!vapidConfigured) return;

  try {
    const filter = { isActive: true };
    if (userId) filter.user = userId;
    if (eventType) filter[`preferences.${eventType}`] = true;

    const subscriptions = await PushSubscription.find(filter);
    if (!subscriptions.length) return;

    const payload = JSON.stringify({ title, body, icon, tag, data, timestamp: new Date().toISOString() });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(sub.subscription, payload)
          .catch(async err => {
            // Remove expired/invalid subscriptions (HTTP 410 Gone)
            if (err.statusCode === 410 || err.statusCode === 404) {
              await PushSubscription.findByIdAndDelete(sub._id);
            }
            throw err;
          })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.warn(`Push: ${sent} gesendet, ${failed} fehlgeschlagen`);
  } catch (err) {
    console.error('Push-Notification Fehler:', err.message);
  }
};

// Convenience helpers

const notifyStatusChange = (delivery, vonStatus, zuStatus, triggerUser) =>
  sendPushNotification({
    title: 'Statusänderung',
    body: `${delivery.lieferscheinNr} (${delivery.kunde?.name}) → ${zuStatus}`,
    tag: `status-${delivery._id}`,
    eventType: 'statusGeaendert',
    data: { deliveryId: delivery._id, lieferscheinNr: delivery.lieferscheinNr, vonStatus, zuStatus, url: `/lieferscheine/${delivery._id}` }
  });

const notifyLagerChange = (delivery, lager) =>
  sendPushNotification({
    title: 'Lagerzuweisung',
    body: `${delivery.lieferscheinNr} → Lager ${lager || 'Keins'}`,
    tag: `lager-${delivery._id}`,
    eventType: 'lagerZugewiesen',
    data: { deliveryId: delivery._id, lager, url: `/lieferscheine/${delivery._id}` }
  });

const notifyImportDone = (result) =>
  sendPushNotification({
    title: 'SelectLine Import abgeschlossen',
    body: `${result.imported} neue, ${result.updated} aktualisierte Lieferscheine`,
    tag: 'import-done',
    eventType: 'importAbgeschlossen',
    data: { ...result, url: '/import' }
  });

const notifyAuslieferungGestartet = (delivery) =>
  sendPushNotification({
    title: 'Auslieferung gestartet',
    body: `Tour für ${delivery.lieferscheinNr} (${delivery.kunde?.name}) ist unterwegs`,
    tag: `auslieferung-${delivery._id}`,
    eventType: 'auslieferungGestartet',
    data: { deliveryId: delivery._id, url: `/lieferscheine/${delivery._id}` }
  });

module.exports = {
  vapidPublicKey,
  vapidConfigured,
  sendPushNotification,
  notifyStatusChange,
  notifyLagerChange,
  notifyImportDone,
  notifyAuslieferungGestartet
};
