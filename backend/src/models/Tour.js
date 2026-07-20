const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  datum: {
    type: Date,
    required: true
  },
  lager: {
    type: String,
    enum: ['frei', 'bengel', 'trier', null],
    default: null
  },
  status: {
    type: String,
    enum: ['geplant', 'bereit', 'in_auslieferung', 'abgeschlossen'],
    default: 'geplant'
  },
  fahrer: String,
  fahrzeug: String,
  fahrerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Driver',  default: null },
  fahrzeugId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  notiz: String,

  // Ordered list of deliveries in this tour
  lieferscheine: [{
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true
    },
    reihenfolge: { type: Number, default: 0 },
    // Cached from delivery for display without populate
    lieferscheinNr: String,
    kundeName: String,
    adresse: String,
    // Estimated/actual times
    geplantAnkunft: Date,
    tatsaechlichAnkunft: Date,
    abgeschlossen: { type: Boolean, default: false }
  }],

  // Route metadata (from geocoding)
  routenInfo: {
    gesamtDistanzKm: Number,
    geschaetzteZeitMin: Number,
    optimiert: { type: Boolean, default: false }
  },

  gestartetAm: Date,
  abgeschlossenAm: Date,
  erstelltVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  geaendertVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

tourSchema.virtual('anzahlLieferscheine').get(function () {
  return this.lieferscheine.length;
});

tourSchema.index({ datum: 1 });
tourSchema.index({ status: 1 });
tourSchema.index({ lager: 1 });

module.exports = mongoose.model('Tour', tourSchema);
