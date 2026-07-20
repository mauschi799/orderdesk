const express = require('express');
const Tour = require('../models/Tour');
const Delivery = require('../models/Delivery');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');
const { geocodeKunde } = require('../services/geocodeService');
const { notifyAuslieferungGestartet } = require('../services/pushService');

const router = express.Router();

// GET /api/tours
router.get('/', auth, async (req, res) => {
  try {
    const { status, lager, datum, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (lager) filter.lager = lager;
    if (datum) {
      const d = new Date(datum);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      filter.datum = { $gte: d, $lt: next };
    }

    const total = await Tour.countDocuments(filter);
    const tours = await Tour.find(filter)
      .populate('erstelltVon', 'name')
      .populate('fahrerId', 'vorname nachname adrSchein adrAblauf')
      .populate('fahrzeugId', 'nummernschild zugelasseneGesamtmasse leergewicht tuevFaellig aktiv')
      .populate('lieferscheine.delivery', 'lieferscheinNr kunde.name kunde.adresse status lager positionen lieferdatum gesamtgewichtNetto')
      .sort({ datum: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ tours, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tours/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id)
      .populate('erstelltVon', 'name username')
      .populate('geaendertVon', 'name')
      .populate('fahrerId', 'vorname nachname adrSchein adrAblauf fuehrerscheinKlassen telefon')
      .populate('fahrzeugId', 'nummernschild zugelasseneGesamtmasse leergewicht tuevFaellig aktiv hersteller modell')
      .populate('lieferscheine.delivery');
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });
    res.json(tour);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tours
router.post('/', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { name, datum, lager, fahrer, fahrzeug, fahrerId, fahrzeugId, notiz, lieferscheinIds = [] } = req.body;

    // Build lieferscheine array with cache data
    const lieferscheine = [];
    for (let i = 0; i < lieferscheinIds.length; i++) {
      const delivery = await Delivery.findById(lieferscheinIds[i]);
      if (delivery) {
        lieferscheine.push({
          delivery: delivery._id,
          reihenfolge: i,
          lieferscheinNr: delivery.lieferscheinNr,
          kundeName: delivery.kunde.name,
          adresse: [delivery.kunde.adresse?.strasse, delivery.kunde.adresse?.plz, delivery.kunde.adresse?.ort].filter(Boolean).join(', ')
        });
      }
    }

    const tour = await Tour.create({
      name, datum, lager, fahrer, fahrzeug,
      fahrerId: fahrerId || null,
      fahrzeugId: fahrzeugId || null,
      notiz,
      lieferscheine,
      erstelltVon: req.user._id
    });

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_erstellt',
      details: { beschreibung: `Tour "${name}" erstellt mit ${lieferscheine.length} Lieferscheinen` },
      req
    });

    res.status(201).json(tour);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tours/:id
router.put('/:id', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id);
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });

    const { name, datum, lager, fahrer, fahrzeug, fahrerId, fahrzeugId, notiz } = req.body;
    Object.assign(tour, {
      name, datum, lager, fahrer, fahrzeug,
      fahrerId: fahrerId || null,
      fahrzeugId: fahrzeugId || null,
      notiz, geaendertVon: req.user._id
    });
    await tour.save();

    res.json(tour);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tours/:id/deliveries - update delivery list (add/remove/reorder)
router.patch('/:id/deliveries', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { lieferscheinIds } = req.body; // ordered array of delivery IDs
    const tour = await Tour.findById(req.params.id);
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });

    const lieferscheine = [];
    for (let i = 0; i < lieferscheinIds.length; i++) {
      const delivery = await Delivery.findById(lieferscheinIds[i]);
      if (delivery) {
        lieferscheine.push({
          delivery: delivery._id,
          reihenfolge: i,
          lieferscheinNr: delivery.lieferscheinNr,
          kundeName: delivery.kunde.name,
          adresse: [delivery.kunde.adresse?.strasse, delivery.kunde.adresse?.plz, delivery.kunde.adresse?.ort].filter(Boolean).join(', '),
          abgeschlossen: tour.lieferscheine.find(l => l.delivery.toString() === delivery._id.toString())?.abgeschlossen || false
        });
      }
    }

    tour.lieferscheine = lieferscheine;
    tour.geaendertVon = req.user._id;
    await tour.save();

    res.json(tour);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tours/:id/status
router.patch('/:id/status', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { status } = req.body;
    const tour = await Tour.findById(req.params.id)
      .populate('lieferscheine.delivery');
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });

    tour.status = status;
    tour.geaendertVon = req.user._id;

    if (status === 'in_auslieferung') {
      tour.gestartetAm = new Date();
      // Update all deliveries in this tour to in_auslieferung
      for (const item of tour.lieferscheine) {
        if (item.delivery) {
          await Delivery.findByIdAndUpdate(item.delivery._id || item.delivery, {
            status: 'in_auslieferung',
            kanbanSpalte: 'in_auslieferung',
            'auslieferung.fahrer': tour.fahrer,
            'auslieferung.fahrzeug': tour.fahrzeug,
            'auslieferung.gestartetAm': new Date()
          });
          if (item.delivery._id) await notifyAuslieferungGestartet(item.delivery);
        }
      }
    } else if (status === 'abgeschlossen') {
      tour.abgeschlossenAm = new Date();
      for (const item of tour.lieferscheine) {
        await Delivery.findByIdAndUpdate(item.delivery._id || item.delivery, {
          status: 'abgeschlossen',
          kanbanSpalte: 'abgeschlossen',
          'auslieferung.abgeschlossenAm': new Date()
        });
      }
    }

    await tour.save();
    res.json(tour);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tours/:id/delivery-status - mark single delivery in tour as done
router.patch('/:id/delivery-status', auth, async (req, res) => {
  try {
    const { deliveryId, abgeschlossen } = req.body;
    const tour = await Tour.findById(req.params.id);
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });

    const item = tour.lieferscheine.find(l => l.delivery.toString() === deliveryId);
    if (!item) return res.status(404).json({ message: 'Lieferschein nicht in dieser Tour' });

    item.abgeschlossen = abgeschlossen;
    if (abgeschlossen) item.tatsaechlichAnkunft = new Date();
    await tour.save();

    // Update the delivery status too
    if (abgeschlossen) {
      await Delivery.findByIdAndUpdate(deliveryId, {
        status: 'abgeschlossen',
        kanbanSpalte: 'abgeschlossen',
        'auslieferung.abgeschlossenAm': new Date()
      });
    }

    res.json(tour);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/tours/:id/geocode - geocode all delivery addresses in this tour
router.post('/:id/geocode', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id)
      .populate('lieferscheine.delivery');
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });

    const results = [];
    for (const item of tour.lieferscheine) {
      const delivery = item.delivery;
      if (!delivery?.kunde?.adresse) continue;

      const coords = await geocodeKunde(delivery.kunde.adresse);
      if (coords) {
        await Delivery.findByIdAndUpdate(delivery._id, {
          'kunde.adresse.lat': coords.lat,
          'kunde.adresse.lng': coords.lng
        });
        results.push({ id: delivery._id, lieferscheinNr: delivery.lieferscheinNr, ...coords });
      }
    }

    res.json({ geocoded: results.length, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tours/:id
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const tour = await Tour.findByIdAndDelete(req.params.id);
    if (!tour) return res.status(404).json({ message: 'Tour nicht gefunden' });
    res.json({ message: 'Tour gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
