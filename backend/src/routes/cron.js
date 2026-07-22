const express = require('express');
const cron = require('node-cron');
const ImportSchedule = require('../models/ImportSchedule');
const { auth, requireRole } = require('../middleware/auth');
const { runImport, startCronJob } = require('../services/cronService');

const router = express.Router();

// GET /api/cron/schedule - get current schedule config
router.get('/schedule', auth, requireRole('administrator'), async (req, res) => {
  try {
    let schedule = await ImportSchedule.findOne();
    if (!schedule) {
      schedule = await ImportSchedule.create({
        aktiv: false,
        cronExpression: '0 6 * * *',
        beschreibung: 'Täglich um 06:00 Uhr',
        tageRueckblick: 7
      });
    }
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/cron/schedule - update schedule
router.put('/schedule', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { aktiv, cronExpression, tageRueckblick, beschreibung } = req.body;

    if (cronExpression && !cron.validate(cronExpression)) {
      return res.status(400).json({ message: 'Ungültiger Cron-Ausdruck' });
    }

    let schedule = await ImportSchedule.findOne();
    if (!schedule) {
      schedule = new ImportSchedule();
    }

    if (cronExpression !== undefined) schedule.cronExpression = cronExpression;
    if (aktiv !== undefined) schedule.aktiv = aktiv;
    if (tageRueckblick !== undefined) schedule.tageRueckblick = tageRueckblick;
    if (beschreibung !== undefined) schedule.beschreibung = beschreibung;

    await schedule.save();

    // Restart cron if active
    if (schedule.aktiv) {
      const ok = startCronJob(schedule.cronExpression, schedule);
      if (!ok) return res.status(400).json({ message: 'Cron-Job konnte nicht gestartet werden' });
    } else {
      // Stop
      startCronJob(null, null); // Will stop active job
      const { getActiveJob } = require('../services/cronService');
      const job = getActiveJob();
      if (job) job.stop();
    }

    res.json(schedule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cron/run-now - trigger import immediately
router.post('/run-now', auth, requireRole('administrator'), async (req, res) => {
  try {
    const schedule = await ImportSchedule.findOne();
    const result = await runImport(schedule);

    // Persist result
    const historyEntry = { zeitpunkt: new Date(), ergebnis: result };
    await ImportSchedule.findOneAndUpdate(
      {},
      {
        $set: { letzterLauf: new Date(), letzterLaufErgebnis: result },
        $push: { historie: { $each: [historyEntry], $slice: -20 } }
      },
      { upsert: true }
    );

    res.json({ message: 'Import abgeschlossen', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/cron/history - get run history
router.get('/history', auth, requireRole('administrator'), async (req, res) => {
  try {
    const schedule = await ImportSchedule.findOne().select('historie letzterLauf letzterLaufErgebnis');
    res.json(schedule || { historie: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Preset cron expressions for the UI
router.get('/presets', auth, requireRole('administrator'), (req, res) => {
  res.json([
    { label: 'Täglich 06:00', expression: '0 6 * * *' },
    { label: 'Täglich 08:00', expression: '0 8 * * *' },
    { label: 'Täglich 12:00', expression: '0 12 * * *' },
    { label: 'Täglich 06:00 und 14:00', expression: '0 6,14 * * *' },
    { label: 'Alle 2 Stunden (06–18 Uhr)', expression: '0 6-18/2 * * *' },
    { label: 'Werktags 07:00', expression: '0 7 * * 1-5' },
    { label: 'Stündlich', expression: '0 * * * *' },
    { label: 'Alle 30 Minuten', expression: '*/30 * * * *' },
  ]);
});

module.exports = router;
