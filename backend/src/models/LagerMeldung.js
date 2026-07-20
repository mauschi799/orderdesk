const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  artikelnummer: { type: String, default: '' },
  beschreibung:  { type: String, required: true },
  menge:         { type: Number, required: true, min: 0 },
  einheit:       { type: String, default: 'Stk' },
}, { _id: false });

const lagerMeldungSchema = new mongoose.Schema({
  filiale:     { type: String, required: true, trim: true },
  gemeldetVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gemeldetAm:  { type: Date, default: Date.now },
  positionen:  [positionSchema],
  notiz:       { type: String },
}, { timestamps: true });

lagerMeldungSchema.index({ filiale: 1, gemeldetAm: -1 });
lagerMeldungSchema.index({ gemeldetAm: -1 });

module.exports = mongoose.model('LagerMeldung', lagerMeldungSchema);
