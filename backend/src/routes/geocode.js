const express = require('express');
const Delivery = require('../models/Delivery');
const { auth, requireRole } = require('../middleware/auth');
const { geocodeKunde } = require('../services/geocodeService');

const router = express.Router();

// GET /api/geocode/deliveries - get all deliveries with geocoords for map view
router.get('/deliveries', auth, async (req, res) => {
  try {
    const { status, lager, lieferdatum } = req.query;
    const filter = {};
    // Default: hide finished/cancelled deliveries; override only when explicitly filtered
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $nin: ['abgeschlossen', 'storniert'] };
    }
    if (lager) filter.lager = lager;
    if (lieferdatum) {
      const d = new Date(lieferdatum);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filter.lieferdatum = { $gte: d, $lt: next };
    }

    const deliveries = await Delivery.find(filter)
      .select('lieferscheinNr kunde status lager lieferdatum positionen kanbanSpalte druckStatus')
      .limit(200);

    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/geocode/single - geocode a single address
router.post('/single', auth, async (req, res) => {
  try {
    const { adresse } = req.body;
    const coords = await geocodeKunde(adresse);
    if (!coords) return res.status(404).json({ message: 'Adresse nicht gefunden' });
    res.json(coords);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/geocode/delivery/:id - geocode a specific delivery and persist
router.post('/delivery/:id', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    const coords = await geocodeKunde(delivery.kunde?.adresse);
    if (!coords) return res.status(404).json({ message: 'Adresse konnte nicht geocodiert werden' });

    delivery.kunde.adresse.lat = coords.lat;
    delivery.kunde.adresse.lng = coords.lng;
    await delivery.save();

    res.json({ ...coords, deliveryId: delivery._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
