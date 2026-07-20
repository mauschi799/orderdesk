const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  benutzer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  benutzerName: String, // denormalized for history
  aktion: {
    type: String,
    required: true,
    enum: [
      'login', 'logout',
      'lieferschein_erstellt', 'lieferschein_geaendert', 'lieferschein_geloescht',
      'status_geaendert', 'lager_zugewiesen', 'gedruckt',
      'auslieferung_gestartet', 'auslieferung_abgeschlossen',
      'import_gestartet', 'import_abgeschlossen',
      'benutzer_erstellt', 'benutzer_geaendert', 'benutzer_geloescht',
      'kanban_verschoben'
    ]
  },
  lieferschein: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery'
  },
  lieferscheinNr: String, // denormalized
  details: {
    vonStatus: String,
    zuStatus: String,
    vonLager: String,
    zuLager: String,
    beschreibung: String,
    aenderungen: mongoose.Schema.Types.Mixed
  },
  ip: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

auditSchema.index({ benutzer: 1, timestamp: -1 });
auditSchema.index({ lieferschein: 1, timestamp: -1 });
auditSchema.index({ aktion: 1 });

module.exports = mongoose.model('AuditLog', auditSchema);
