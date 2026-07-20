const express = require('express');
const AuditLog = require('../models/AuditLog');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit
router.get('/', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { lieferschein, benutzer, aktion, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (lieferschein) filter.lieferschein = lieferschein;
    if (benutzer) filter.benutzer = benutzer;
    if (aktion) filter.aktion = aktion;

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .populate('benutzer', 'name username role')
      .populate('lieferschein', 'lieferscheinNr kunde.name')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ logs, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
