const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  nummernschild: { type: String, required: true, trim: true, unique: true },
  hersteller:    { type: String, trim: true, default: '' },
  modell:        { type: String, trim: true, default: '' },
  typ: {
    type: String,
    enum: ['lkw', 'transporter', 'pkw', 'anhaenger', 'sonstige'],
    default: 'lkw',
  },
  standort:      { type: String, trim: true, default: '' },
  baujahr:       { type: Number, default: null },
  // Gewichte in kg
  zugelasseneGesamtmasse: { type: Number, default: null }, // zGM
  leergewicht:            { type: Number, default: null },
  // Pflichttermine
  tuevFaellig:   { type: Date, default: null },
  uvvFaellig:    { type: Date, default: null },
  hauptuntersuchungFaellig: { type: Date, default: null },
  // Status
  aktiv: { type: Boolean, default: true },
  notiz: { type: String, default: '' },
  // Dokumente
  dokumente: [{
    name:         { type: String, required: true },
    originalname: { type: String },
    filename:     { type: String, required: true },
    mimetype:     { type: String },
    size:         { type: Number },
    hochgeladenAm: { type: Date, default: Date.now },
    hochgeladenVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
}, { timestamps: true });

vehicleSchema.index({ standort: 1 });
vehicleSchema.index({ aktiv: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
