const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const Delivery       = require('../models/Delivery');
const Tour           = require('../models/Tour');
const Driver         = require('../models/Driver');
const Vehicle        = require('../models/Vehicle');
const AuditLog       = require('../models/AuditLog');
const LagerMeldung   = require('../models/LagerMeldung');
const PushSubscription = require('../models/PushSubscription');
const ImportSchedule = require('../models/ImportSchedule');

const router = express.Router();
router.use(auth, requireRole('administrator'));

// DELETE /api/admin/reset — löscht alle Geschäftsdaten, behält Benutzer & Einstellungen
router.delete('/reset', async (req, res) => {
  try {
    const results = await Promise.all([
      Delivery.deleteMany({}).then(r => ({ collection: 'Lieferscheine', deleted: r.deletedCount })),
      Tour.deleteMany({}).then(r => ({ collection: 'Touren', deleted: r.deletedCount })),
      Driver.deleteMany({}).then(r => ({ collection: 'Fahrer', deleted: r.deletedCount })),
      Vehicle.deleteMany({}).then(r => ({ collection: 'Fahrzeuge', deleted: r.deletedCount })),
      AuditLog.deleteMany({}).then(r => ({ collection: 'Audit-Logs', deleted: r.deletedCount })),
      LagerMeldung.deleteMany({}).then(r => ({ collection: 'Lagermeldungen', deleted: r.deletedCount })),
      PushSubscription.deleteMany({}).then(r => ({ collection: 'Push-Abonnements', deleted: r.deletedCount })),
      ImportSchedule.deleteMany({}).then(r => ({ collection: 'Import-Zeitpläne', deleted: r.deletedCount })),
    ]);

    const total = results.reduce((s, r) => s + r.deleted, 0);
    console.log(`[ADMIN] Reset durchgeführt von ${req.user.name}:`, results);

    res.json({
      message: `Reset abgeschlossen — ${total} Einträge gelöscht`,
      details: results,
      behalten: ['Benutzer', 'Markeneinstellungen', 'Lagerprodukte'],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
