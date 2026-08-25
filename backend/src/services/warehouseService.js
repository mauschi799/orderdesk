const Warehouse = require('../models/Warehouse');

// Bestehende Installationen haben "frei"/"trier"/"bengel" seit jeher als
// Delivery.lager-Werte im Einsatz, ohne dass dafür je ein Warehouse-Dokument
// existierte (das Konzept war früher hart codiert). Beim ersten Start nach
// diesem Umbau müssen alle drei als Warehouse-Einträge existieren, sonst
// verschwindet ihre Kanban-Spalte und bestehende Lieferscheine mit diesem
// lager-Wert landen in "Neu".
const DEFAULTS = [
  { code: 'frei', name: 'Frei', farbe: 'emerald', sortierung: 1 },
  { code: 'trier', name: 'Trier', farbe: 'sky', sortierung: 2 },
  { code: 'bengel', name: 'Bengel', farbe: 'orange', sortierung: 3 },
];

async function ensureDefaultWarehouses() {
  const count = await Warehouse.countDocuments();
  if (count > 0) return;
  await Warehouse.insertMany(DEFAULTS);
  console.log('✅ Standard-Läger (Trier, Bengel) angelegt');
}

module.exports = { ensureDefaultWarehouses };
