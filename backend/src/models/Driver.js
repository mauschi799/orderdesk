const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  vorname:  { type: String, required: true, trim: true },
  nachname: { type: String, required: true, trim: true },
  telefon:  { type: String, trim: true, default: '' },
  email:    { type: String, trim: true, default: '' },
  geburtsdatum: { type: Date, default: null },
  standort: { type: String, trim: true, default: '' },
  // Führerschein
  fuehrerscheinNr:      { type: String, trim: true, default: '' },
  fuehrerscheinKlassen: [{ type: String, trim: true }],
  fuehrerscheinAblauf:  { type: Date, default: null },
  // ADR-Schein (Gefahrgut > 1000 Punkte)
  adrSchein: { type: Boolean, default: false },
  adrAblauf: { type: Date, default: null },
  // Status
  aktiv: { type: Boolean, default: true },
  notiz: { type: String, default: '' },
  // Dokumente
  dokumente: [{
    name:          { type: String, required: true },
    originalname:  { type: String },
    filename:      { type: String, required: true },
    mimetype:      { type: String },
    size:          { type: Number },
    hochgeladenAm: { type: Date, default: Date.now },
    hochgeladenVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
}, { timestamps: true });

driverSchema.index({ nachname: 1, vorname: 1 });
driverSchema.index({ standort: 1 });
driverSchema.index({ aktiv: 1 });

module.exports = mongoose.model('Driver', driverSchema);
