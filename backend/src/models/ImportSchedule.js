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
