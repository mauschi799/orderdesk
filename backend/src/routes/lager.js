const express = require('express');
const LagerMeldung = require('../models/LagerMeldung');
const LagerProdukt = require('../models/LagerProdukt');
const User         = require('../models/User');
const { auth }     = require('../middleware/auth');

const router = express.Router();

// ── Berechtigungs-Helpers ─────────────────────────────────────────────────────
// Rückgabe: null = alle Filialen, [] = keine Berechtigung, ['x'] = nur diese

function getMeldenFilialen(user) {
  if (user.role === 'administrator') return null;
  if (user.role === 'filialen') return user.filiale ? [user.filiale] : [];
  if (user.lagerMelden?.aktiv) {
    const f = (user.lagerMelden.filialen || []).filter(Boolean);
    return f.length > 0 ? f : null;
  }
  return [];
}

function getLesenFilialen(user) {
  if (user.role === 'administrator' || user.role === 'lagerist') return null;
  if (user.lagerLesen?.aktiv) {
    const f = (user.lagerLesen.filialen || []).filter(Boolean);
    return f.length > 0 ? f : null;
  }
  return [];
}

const requireMeldenAccess = (req, res, next) => {
  const f = getMeldenFilialen(req.user);
  if (f !== null && f.length === 0) {
    return res.status(403).json({ message: 'Keine Berechtigung für Bestandsmeldungen' });
  }
  next();
};

const requireLesenAccess = (req, res, next) => {
  const f = getLesenFilialen(req.user);
  if (f !== null && f.length === 0) {
    return res.status(403).json({ message: 'Keine Berechtigung für Bestandseinsicht' });
  }
  next();
};

// Alle bekannten Filial-Namen aus Users + Meldungen
async function getAlleFilialen(filterFilialen) {
  const userFilter = { role: 'filialen', filiale: { $ne: null } };
  const meldFilter = {};
  if (filterFilialen !== null) {
    userFilter.filiale = { $ne: null, $in: filterFilialen };
    meldFilter.filiale = { $in: filterFilialen };
  }
  const fromUsers     = await User.distinct('filiale', userFilter);
  const fromMeldungen = await LagerMeldung.distinct('filiale', meldFilter);
  return [...new Set([...fromUsers, ...fromMeldungen].filter(Boolean))].sort();
}

// ── Produkte ──────────────────────────────────────────────────────────────────

// GET /api/lager/produkte — alle Produkte (Lesen-Berechtigung)
router.get('/produkte', auth, requireLesenAccess, async (req, res) => {
  try {
    const produkte = await LagerProdukt.find().sort({ sortierung: 1, beschreibung: 1 });
    res.json(produkte);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/lager/produkte/meine — aktive Produkte für eine Filiale (Melden-Berechtigung)
// Query: ?filiale=X (bei mehreren Filialen nötig)
router.get('/produkte/meine', auth, requireMeldenAccess, async (req, res) => {
  try {
    let filiale;
    if (req.user.role === 'filialen') {
      filiale = req.user.filiale;
    } else {
      filiale = req.query.filiale || null;
      if (filiale) {
        const meldenFilialen = getMeldenFilialen(req.user);
        if (meldenFilialen !== null && !meldenFilialen.includes(filiale)) {
          return res.status(403).json({ message: 'Keine Berechtigung für diese Filiale' });
        }
      }
    }

    const query = { aktiv: true };
    if (filiale) {
      query.$or = [{ verfuegbarIn: { $size: 0 } }, { verfuegbarIn: filiale }];
    }
    const produkte = await LagerProdukt.find(query).sort({ sortierung: 1, beschreibung: 1 });
    res.json(produkte);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/lager/produkte — Produkt anlegen (Admin)
router.post('/produkte', auth, async (req, res) => {
  if (req.user.role !== 'administrator') return res.status(403).json({ message: 'Nur Administratoren dürfen Produkte anlegen' });
  try {
    const produkt = await LagerProdukt.create(req.body);
    res.status(201).json(produkt);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/lager/produkte/:id — Produkt bearbeiten (Admin)
router.put('/produkte/:id', auth, async (req, res) => {
  if (req.user.role !== 'administrator') return res.status(403).json({ message: 'Nur Administratoren dürfen Produkte bearbeiten' });
  try {
    const produkt = await LagerProdukt.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!produkt) return res.status(404).json({ message: 'Produkt nicht gefunden' });
    res.json(produkt);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/lager/produkte/:id — Produkt löschen (Admin)
router.delete('/produkte/:id', auth, async (req, res) => {
  if (req.user.role !== 'administrator') return res.status(403).json({ message: 'Nur Administratoren dürfen Produkte löschen' });
  try {
    const produkt = await LagerProdukt.findByIdAndDelete(req.params.id);
    if (!produkt) return res.status(404).json({ message: 'Produkt nicht gefunden' });
    res.json({ message: 'Produkt gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Meldungen ─────────────────────────────────────────────────────────────────

// POST /api/lager/meldung — Bestandsmeldung abgeben
router.post('/meldung', auth, requireMeldenAccess, async (req, res) => {
  try {
    const meldenFilialen = getMeldenFilialen(req.user);

    let filiale;
    if (req.user.role === 'filialen') {
      filiale = req.user.filiale;
    } else {
      filiale = req.body.filiale;
      if (!filiale) return res.status(400).json({ message: 'Filiale erforderlich' });
      if (meldenFilialen !== null && !meldenFilialen.includes(filiale)) {
        return res.status(403).json({ message: 'Keine Berechtigung für diese Filiale' });
      }
    }

    if (!filiale) return res.status(400).json({ message: 'Kein Filialname für diesen Benutzer hinterlegt' });

    const { positionen, notiz } = req.body;
    if (!Array.isArray(positionen) || positionen.length === 0) {
      return res.status(400).json({ message: 'Mindestens eine Position erforderlich' });
    }

    const meldung = await LagerMeldung.create({
      filiale,
      gemeldetVon: req.user._id,
      positionen,
      notiz: notiz || null,
    });

    const populated = await meldung.populate('gemeldetVon', 'name username');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/lager/meine — Eigene letzte Meldungen
router.get('/meine', auth, requireMeldenAccess, async (req, res) => {
  try {
    const filter = req.user.role === 'filialen'
      ? { filiale: req.user.filiale }
      : { gemeldetVon: req.user._id };

    const meldungen = await LagerMeldung.find(filter)
      .populate('gemeldetVon', 'name username')
      .sort({ gemeldetAm: -1 })
      .limit(10);
    res.json(meldungen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/lager/aktuell — Neueste Meldung pro Filiale
router.get('/aktuell', auth, requireLesenAccess, async (req, res) => {
  try {
    const lesenFilialen = getLesenFilialen(req.user);
    const pipeline = [];

    if (lesenFilialen !== null) {
      pipeline.push({ $match: { filiale: { $in: lesenFilialen } } });
    }
    pipeline.push(
      { $sort: { gemeldetAm: -1 } },
      { $group: { _id: '$filiale', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { filiale: 1 } }
    );

    const neueste = await LagerMeldung.aggregate(pipeline);
    const populated = await LagerMeldung.populate(neueste, { path: 'gemeldetVon', select: 'name username' });
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/lager/meldungen — Alle Meldungen mit Filter
router.get('/meldungen', auth, requireLesenAccess, async (req, res) => {
  try {
    const lesenFilialen = getLesenFilialen(req.user);
    const { filiale, limit = 200 } = req.query;

    const filter = {};

    if (filiale) {
      if (lesenFilialen !== null && !lesenFilialen.includes(filiale)) {
        return res.status(403).json({ message: 'Keine Berechtigung für diese Filiale' });
      }
      filter.filiale = filiale;
    } else if (lesenFilialen !== null) {
      filter.filiale = { $in: lesenFilialen };
    }

    const meldungen = await LagerMeldung.find(filter)
      .populate('gemeldetVon', 'name username')
      .sort({ gemeldetAm: -1 })
      .limit(parseInt(limit));
    res.json(meldungen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/lager/filialen — Filialen die der User einsehen darf
router.get('/filialen', auth, requireLesenAccess, async (req, res) => {
  try {
    const lesenFilialen = getLesenFilialen(req.user);
    const all = await getAlleFilialen(lesenFilialen);
    res.json(all);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/lager/melde-filialen — Filialen für die der User melden darf
router.get('/melde-filialen', auth, requireMeldenAccess, async (req, res) => {
  try {
    if (req.user.role === 'filialen') {
      return res.json(req.user.filiale ? [req.user.filiale] : []);
    }
    const meldenFilialen = getMeldenFilialen(req.user);
    if (meldenFilialen === null) {
      const all = await getAlleFilialen(null);
      return res.json(all);
    }
    return res.json(meldenFilialen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
