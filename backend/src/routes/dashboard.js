const express = require('express');
const Delivery = require('../models/Delivery');
const AuditLog = require('../models/AuditLog');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [statusCounts, lagerCounts, todayCount, openCount, recentActivity] = await Promise.all([
      Delivery.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Delivery.aggregate([
        { $match: { lager: { $ne: null } } },
        { $group: { _id: '$lager', count: { $sum: 1 } } }
      ]),
      Delivery.countDocuments({ lieferdatum: { $gte: today, $lt: tomorrow } }),
      Delivery.countDocuments({ status: { $in: ['neu', 'nicht_zugewiesen', 'zugewiesen', 'gedruckt', 'in_auslieferung'] } }),
      AuditLog.find().sort({ timestamp: -1 }).limit(15)
        .populate('benutzer', 'name username')
        .populate('lieferschein', 'lieferscheinNr')
    ]);

    res.json({
      gesamt: await Delivery.countDocuments(),
      heute: todayCount,
      offen: openCount,
      nachStatus: Object.fromEntries(statusCounts.map(s => [s._id, s.count])),
      nachLager: Object.fromEntries(lagerCounts.map(l => [l._id, l.count])),
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
