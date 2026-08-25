const mongoose = require('mongoose');

// Auslieferungslager (Depot), z.B. Trier/Bengel. `code` ist der Wert, der auf
// Delivery.lager / Delivery.kanbanSpalte / Tour.lager / User.depot gespeichert
// wird und zugleich die Kanban-Spalten-ID ist.
const warehouseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9_-]+$/
  },
  name: { type: String, required: true, trim: true },
  farbe: {
    type: String,
    enum: ['slate', 'sky', 'orange', 'emerald', 'violet', 'rose', 'amber', 'indigo', 'teal', 'pink'],
    default: 'slate'
  },
  aktiv: { type: Boolean, default: true },
  sortierung: { type: Number, default: 0 },
}, { timestamps: true });

warehouseSchema.index({ aktiv: 1, sortierung: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
