const express = require('express');
const Warehouse = require('../models/Warehouse');
const Delivery = require('../models/Delivery');
const Tour = require('../models/Tour');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/warehouses - alle Läger (optional ?aktiv=true für nur aktive)
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.aktiv === 'true') filter.aktiv = true;
    const warehouses = await Warehouse.find(filter).sort({ sortierung: 1, name: 1 });
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/warehouses - Lager anlegen (Admin)
router.post('/', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { code, name, farbe, sortierung } = req.body;
    const warehouse = await Warehouse.create({ code, name, farbe, sortierung });
    res.status(201).json(warehouse);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: `Lager-Code "${req.body.code}" ist bereits vergeben` });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/warehouses/:id - Lager bearbeiten (Admin)
// Der Code wird bewusst nicht änderbar gemacht, da er in Delivery/Tour/User als
// Freitext-Wert gespeichert ist - eine Umbenennung würde diese Referenzen verwaisen
// lassen, ohne dass wir sie automatisch migrieren.
router.put('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { name, farbe, sortierung, aktiv } = req.body;
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      { name, farbe, sortierung, aktiv },
      { new: true, runValidators: true }
    );
    if (!warehouse) return res.status(404).json({ message: 'Lager nicht gefunden' });
    res.json(warehouse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/warehouses/:id - Lager löschen (Admin)
// Blockiert, solange noch Lieferscheine/Touren/Benutzer den Lager-Code referenzieren
// - sonst würden diese verwaist stehen bleiben (Kanban-Karte ohne Spalte etc.).
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) return res.status(404).json({ message: 'Lager nicht gefunden' });

    const [deliveryCount, tourCount, userCount] = await Promise.all([
      Delivery.countDocuments({ lager: warehouse.code }),
      Tour.countDocuments({ lager: warehouse.code }),
      User.countDocuments({ depot: warehouse.code }),
    ]);
    const inUse = deliveryCount + tourCount + userCount;
    if (inUse > 0) {
      return res.status(409).json({
        message: `Lager wird noch verwendet (${deliveryCount} Lieferscheine, ${tourCount} Touren, ${userCount} Benutzer) - erst deaktivieren oder Referenzen umziehen`
      });
    }

    await warehouse.deleteOne();
    res.json({ message: 'Lager gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
