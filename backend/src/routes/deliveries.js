const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Delivery = require('../models/Delivery');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');
const { notifyStatusChange, notifyLagerChange } = require('../services/pushService');

const router = express.Router();

const VALID_STATUSES = ['neu', 'nicht_zugewiesen', 'zugewiesen', 'gedruckt', 'in_auslieferung', 'abgeschlossen', 'storniert'];

// GET /api/deliveries - list with filters
router.get('/', auth, async (req, res) => {
  try {
    const {
      status, lager, search, startDate, endDate,
      page = 1, limit = 50, sort = '-lieferdatum'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (lager) filter.lager = lager;
    if (startDate || endDate) {
      filter.lieferdatum = {};
      if (startDate) filter.lieferdatum.$gte = new Date(startDate);
      if (endDate) filter.lieferdatum.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { lieferscheinNr: new RegExp(search, 'i') },
        { 'kunde.name': new RegExp(search, 'i') },
        { 'kunde.kundennummer': new RegExp(search, 'i') }
      ];
    }

    const total = await Delivery.countDocuments(filter);
    const deliveries = await Delivery.find(filter)
      .populate('zugewiesenAn', 'name username')
      .populate('erstelltVon', 'name')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      deliveries,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/deliveries/kanban - grouped by kanban column
// New primary columns: neu | trier | bengel | erledigt
router.get('/kanban', auth, async (req, res) => {
  try {
    // abgeschlossen + storniert are excluded – they live in the Lieferscheine list
    const deliveries = await Delivery.find({ status: { $nin: ['storniert', 'abgeschlossen'] } })
      .populate('zugewiesenAn', 'name username')
      .sort({ kanbanPosition: 1, lieferdatum: 1 });

    const columns = {
      neu:     [],
      trier:   [],
      bengel:  [],
      erledigt: [],
    };

    deliveries.forEach(d => {
      const col = d.kanbanSpalte;
      // Map legacy columns to new structure
      let target = col;
      if (col === 'nicht_zugewiesen') target = 'neu';
      else if (col === 'zugewiesen') {
        target = d.lager === 'trier' ? 'trier' : d.lager === 'bengel' ? 'bengel' : 'neu';
      } else if (['gedruckt', 'in_auslieferung'].includes(col)) {
        target = d.lager === 'trier' ? 'trier' : d.lager === 'bengel' ? 'bengel' : 'neu';
      } else if (col === 'abgeschlossen') {
        target = 'erledigt';
      }
      if (columns[target] !== undefined) {
        columns[target].push(d);
      } else {
        columns.neu.push(d);
      }
    });

    res.json(columns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/deliveries/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('zugewiesenAn', 'name username role')
      .populate('erstelltVon', 'name')
      .populate('geaendertVon', 'name')
      .populate('druckStatus.gedrucktVon', 'name');

    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });
    res.json(delivery);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/deliveries - create manual
router.post('/', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const deliveryData = {
      ...req.body,
      importQuelle: 'manuell',
      erstelltVon: req.user._id,
      status: 'neu',
      kanbanSpalte: 'neu'
    };

    const delivery = await Delivery.create(deliveryData);

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_erstellt',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      details: { beschreibung: `Manuell erstellt für ${delivery.kunde.name}` },
      req
    });

    res.status(201).json(delivery);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Lieferscheinnummer bereits vorhanden' });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/deliveries/:id - update
router.put('/:id', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    if (['abgeschlossen', 'storniert'].includes(delivery.status) && req.user.role !== 'administrator') {
      return res.status(403).json({ message: 'Abgeschlossene Lieferscheine können nicht bearbeitet werden' });
    }

    const oldData = delivery.toObject();
    Object.assign(delivery, { ...req.body, geaendertVon: req.user._id });
    await delivery.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_geaendert',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      req
    });

    res.json(delivery);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/deliveries/:id/status - change status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, notiz } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Ungültiger Status' });
    }

    // Role checks
    const roleStatusMap = {
      lagerist: ['gedruckt', 'in_auslieferung', 'abgeschlossen'],
      disponent: VALID_STATUSES,
      administrator: VALID_STATUSES,
      viewer: []
    };
    if (!roleStatusMap[req.user.role]?.includes(status)) {
      return res.status(403).json({ message: 'Keine Berechtigung für diesen Status' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    const altStatus = delivery.status;
    delivery.status = status;
    delivery.kanbanSpalte = status === 'storniert' ? 'abgeschlossen' : status;
    delivery.geaendertVon = req.user._id;

    // Status-specific updates
    if (status === 'in_auslieferung' && !delivery.auslieferung?.gestartetAm) {
      delivery.auslieferung = { ...delivery.auslieferung, gestartetAm: new Date() };
    }
    if (status === 'abgeschlossen' && !delivery.auslieferung?.abgeschlossenAm) {
      delivery.auslieferung = { ...delivery.auslieferung, abgeschlossenAm: new Date() };
    }
    if (notiz) delivery.notiz = notiz;

    await delivery.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'status_geaendert',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      details: { vonStatus: altStatus, zuStatus: status },
      req
    });
    notifyStatusChange(delivery, altStatus, status, req.user).catch(() => {});

    res.json(delivery);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/deliveries/:id/lager - assign depot
router.patch('/:id/lager', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { lager } = req.body;
    if (!['frei', 'bengel', 'trier', null].includes(lager)) {
      return res.status(400).json({ message: 'Ungültiges Lager' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    const altLager = delivery.lager;
    delivery.lager = lager;
    if (delivery.status === 'neu' || delivery.status === 'nicht_zugewiesen') {
      delivery.status = lager ? 'zugewiesen' : 'nicht_zugewiesen';
      delivery.kanbanSpalte = delivery.status;
    }
    await delivery.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lager_zugewiesen',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      details: { vonLager: altLager, zuLager: lager },
      req
    });
    notifyLagerChange(delivery, lager).catch(() => {});

    res.json(delivery);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/deliveries/:id/print - mark as printed
router.patch('/:id/print', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    delivery.druckStatus = {
      gedruckt: true,
      gedrucktAm: new Date(),
      gedrucktVon: req.user._id,
      druckAnzahl: (delivery.druckStatus?.druckAnzahl || 0) + 1
    };
    if (delivery.status === 'zugewiesen') {
      delivery.status = 'gedruckt';
      delivery.kanbanSpalte = 'gedruckt';
    }
    await delivery.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'gedruckt',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      req
    });

    res.json(delivery);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/deliveries/kanban/move - drag & drop
// New column semantics: neu | trier | bengel | erledigt
// Dropping onto trier/bengel also sets lager and status=zugewiesen
// Dropping onto erledigt sets status=abgeschlossen
router.patch('/kanban/move', auth, requireRole('administrator', 'disponent'), async (req, res) => {
  try {
    const { deliveryId, spalte, position } = req.body;

    const VALID_SPALTEN = ['neu', 'trier', 'bengel', 'erledigt',
      'nicht_zugewiesen', 'zugewiesen', 'gedruckt', 'in_auslieferung', 'abgeschlossen'];
    if (!VALID_SPALTEN.includes(spalte)) {
      return res.status(400).json({ message: 'Ungültige Kanban-Spalte' });
    }

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    const altSpalte = delivery.kanbanSpalte;
    const altLager  = delivery.lager;
    const altStatus = delivery.status;

    delivery.kanbanSpalte  = spalte;
    delivery.kanbanPosition = position;

    // Column → lager + status mapping
    if (spalte === 'trier') {
      delivery.lager  = 'trier';
      delivery.status = 'zugewiesen';
    } else if (spalte === 'bengel') {
      delivery.lager  = 'bengel';
      delivery.status = 'zugewiesen';
    } else if (spalte === 'erledigt') {
      delivery.status = 'abgeschlossen';
      if (!delivery.auslieferung) delivery.auslieferung = {};
      if (!delivery.auslieferung.abgeschlossenAm) delivery.auslieferung.abgeschlossenAm = new Date();
    } else if (spalte === 'neu') {
      delivery.lager  = null;
      delivery.status = 'neu';
    } else {
      // Legacy status columns – keep lager, update status
      delivery.status = spalte;
    }

    await delivery.save();

    // Notifications
    const { notifyStatusChange, notifyLagerChange } = require('../services/pushService');
    if (delivery.status !== altStatus) notifyStatusChange(delivery, altStatus, delivery.status).catch(() => {});
    if (delivery.lager !== altLager)   notifyLagerChange(delivery, delivery.lager).catch(() => {});

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'kanban_verschoben',
      lieferschein: delivery._id,
      lieferscheinNr: delivery.lieferscheinNr,
      details: { vonStatus: altSpalte, zuStatus: spalte, vonLager: altLager, zuLager: delivery.lager },
      req
    });

    res.json(delivery);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/deliveries/:id
// DELETE /api/deliveries/all — löscht ALLE Lieferscheine (nur Administrator)
router.delete('/all', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { deletedCount } = await Delivery.deleteMany({});
    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_geloescht',
      details: { beschreibung: `Alle Lieferscheine gelöscht (${deletedCount} Einträge)` },
      req
    });
    res.json({ message: `${deletedCount} Lieferscheine gelöscht` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/deliveries/:id
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndDelete(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Lieferschein nicht gefunden' });

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_geloescht',
      lieferscheinNr: delivery.lieferscheinNr,
      req
    });

    res.json({ message: 'Lieferschein gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
