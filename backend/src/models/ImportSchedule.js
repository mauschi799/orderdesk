const mongoose = require('mongoose');

const importScheduleSchema = new mongoose.Schema({
  name: { type: String, default: 'SelectLine Auto-Import' },
  aktiv: { type: Boolean, default: false },
  // Cron expression (e.g. "0 6 * * *" = täglich 06:00)
  cronExpression: { type: String, default: '0 6 * * *' },
  // Human readable
  beschreibung: String,
  // Import window: how many days back to look
  tageRueckblick: { type: Number, default: 7 },
  // Ruhezeit: In diesem Fenster wird der automatische Sync übersprungen
  // (manueller "Jetzt importieren" ist davon nicht betroffen). Format "HH:mm".
  // Standard 18:00-07:30 deckt über Mitternacht hinweg ab.
  ruhezeitAktiv: { type: Boolean, default: true },
  ruhezeitVon: { type: String, default: '18:00' },
  ruhezeitBis: { type: String, default: '07:30' },
  // Last run info
  letzterLauf: Date,
  letzterLaufErgebnis: {
    imported: Number,
    updated: Number,
    skipped: Number,
    errors: [String],
    dauer: Number // ms
  },
  naechsterLauf: Date,
  // Run history (last 20)
  historie: [{
    zeitpunkt: Date,
    ergebnis: {
      imported: Number,
      updated: Number,
      skipped: Number,
      errors: [String],
      dauer: Number
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('ImportSchedule', importScheduleSchema);
