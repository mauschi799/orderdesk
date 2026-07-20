const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  artikelnummer: { type: String, default: '' },
  beschreibung: { type: String, default: '' },
  menge: { type: Number, required: true },
  gewicht: { type: Number, default: 0 },
  einheit: { type: String, default: 'Stk' },
  artikelGruppeNr: { type: String, default: null },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  strasse: String,
  plz: String,
  ort: String,
  land: { type: String, default: 'DE' },
  lat: Number,
  lng: Number
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  // Lieferscheinnummer (aus SelectLine oder intern)
  lieferscheinNr: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Auftragsnummer aus SelectLine
  auftragNr: { type: String, trim: true },
  // SelectLine-spezifische ID für Abgleich
  selectlineId: { type: String, sparse: true },

  // Kunde
  kunde: {
    kundennummer: { type: String },
    name: { type: String, required: true },
    name2: String,
    adresse: addressSchema,
    telefon: String,
    email: String
  },

  // Lieferdaten
  lieferdatum: { type: Date, required: true },
  erstelltAm: { type: Date, default: Date.now },
  notiz: String,

  // Positionen (Gasflaschen)
  positionen: [positionSchema],

  // Status-Workflow
  status: {
    type: String,
    enum: ['neu', 'nicht_zugewiesen', 'zugewiesen', 'gedruckt', 'in_auslieferung', 'abgeschlossen', 'storniert'],
    default: 'neu'
  },

  // Lagerzuweisung
  lager: {
    type: String,
    enum: ['frei', 'bengel', 'trier', null],
    default: null
  },

  // Kanban-Board Spalte (kann von Status abweichen für Drag&Drop)
  kanbanSpalte: {
    type: String,
    enum: ['neu', 'trier', 'bengel', 'erledigt', 'nicht_zugewiesen', 'zugewiesen', 'gedruckt', 'in_auslieferung', 'abgeschlossen'],
    default: 'neu'
  },

  // Sortierung innerhalb der Spalte
  kanbanPosition: { type: Number, default: 0 },

  // Druck-Status
  druckStatus: {
    gedruckt: { type: Boolean, default: false },
    gedrucktAm: Date,
    gedrucktVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    druckAnzahl: { type: Number, default: 0 }
  },

  // Auslieferung
  auslieferung: {
    fahrer: String,
    fahrzeug: String,
    gestartetAm: Date,
    abgeschlossenAm: Date
  },

  // Zuweisung
  zugewiesenAn: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  zugewiesenAm: Date,

  // Import-Metadaten
  importiert: { type: Boolean, default: false },
  importiertAm: Date,
  importQuelle: { type: String, enum: ['selectline', 'manuell'], default: 'manuell' },

  // Erstellt/Geändert
  erstelltVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  geaendertVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
deliverySchema.virtual('gesamtgewichtNetto').get(function() {
  return (this.positionen || []).reduce((sum, pos) => sum + (pos.gewicht || 0) * pos.menge, 0);
});

deliverySchema.virtual('gesamtMenge').get(function() {
  return (this.positionen || []).reduce((sum, pos) => sum + pos.menge, 0);
});

// Indexes
deliverySchema.index({ status: 1 });
deliverySchema.index({ lager: 1 });
deliverySchema.index({ lieferdatum: 1 });
deliverySchema.index({ 'kunde.kundennummer': 1 });
deliverySchema.index({ selectlineId: 1 }, { sparse: true });
deliverySchema.index({ kanbanSpalte: 1, kanbanPosition: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
