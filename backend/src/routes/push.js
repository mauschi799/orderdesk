const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const { auth } = require('../middleware/auth');
const { vapidPublicKey, vapidConfigured, sendPushNotification } = require('../services/pushService');

const router = express.Router();

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  if (!vapidConfigured) {
    return res.json({ configured: false, publicKey: null });
  }
  res.json({ configured: true, publicKey: vapidPublicKey });
});

// POST /api/push/subscribe - register a push subscription
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription, preferences } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'Ungültige Subscription' });
    }

    const sub = await PushSubscription.findOneAndUpdate(
      { user: req.user._id, 'subscription.endpoint': subscription.endpoint },
      {
        user: req.user._id,
        subscription,
        userAgent: req.headers['user-agent'],
        isActive: true,
        ...(preferences && { preferences })
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Subscription gespeichert', id: sub._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/push/unsubscribe
router.delete('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await PushSubscription.deleteOne({ user: req.user._id, 'subscription.endpoint': endpoint });
    } else {
      await PushSubscription.deleteMany({ user: req.user._id });
    }
    res.json({ message: 'Abgemeldet' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/push/status - check if user has active subscription
router.get('/status', auth, async (req, res) => {
  try {
    const count = await PushSubscription.countDocuments({ user: req.user._id, isActive: true });
    res.json({ subscribed: count > 0, count, configured: vapidConfigured });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/push/preferences - update notification preferences
router.patch('/preferences', auth, async (req, res) => {
  try {
    const { preferences } = req.body;
    await PushSubscription.updateMany(
      { user: req.user._id },
      { $set: { preferences } }
    );
    res.json({ message: 'Einstellungen aktualisiert' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/push/test - send a test notification to the requesting user
router.post('/test', auth, async (req, res) => {
  try {
    await sendPushNotification({
      title: 'Orderdesk Test',
      body: 'Push-Notifications funktionieren! 🎉',
      tag: 'test',
      userId: req.user._id,
      data: { url: '/dashboard' }
    });
    res.json({ message: 'Test-Benachrichtigung gesendet' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
