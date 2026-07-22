const mongoose = require('mongoose');

const lagerProduktSchema = new mongoose.Schema({
  // 'trenner' = reine Überschrift/Trenner in der Meldemaske, kein echtes Produkt —
  // beschreibung dient dann als Trenner-Text, artikelnummer/einheit bleiben leer
  // und werden beim Melden ignoriert.
  typ:           { type: String, enum: ['produkt', 'trenner'], default: 'produkt' },
  artikelnummer: { type: String, trim: true, default: '' },
  beschreibung:  { type: String, required: true, trim: true },
  einheit:       { type: String, default: 'Stk' },
  aktiv:         { type: Boolean, default: true },
  sortierung:    { type: Number, default: 0 },
  // Leer = in allen Filialen sichtbar; befüllt = nur in diesen Filialen
  verfuegbarIn:  [{ type: String, trim: true }],
}, { timestamps: true });

lagerProduktSchema.index({ aktiv: 1, sortierung: 1 });

module.exports = mongoose.model('LagerProdukt', lagerProduktSchema);
