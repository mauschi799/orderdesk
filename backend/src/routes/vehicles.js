const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Vehicle = require('../models/Vehicle');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Upload directory
const uploadDir = path.join(__dirname, '../../uploads/fahrzeuge');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/fahrzeuge/dokumente/:filename — Datei herunterladen/anzeigen
router.get('/dokumente/:filename', auth, requireRole('administrator', 'disponent', 'lagerist'), (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Datei nicht gefunden' });
  res.sendFile(filePath);
});

// GET /api/fahrzeuge — alle Fahrzeuge
router.get('/', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const { standort, aktiv } = req.query;
    const filter = {};
    if (standort) filter.standort = standort;
    if (aktiv !== undefined) filter.aktiv = aktiv === 'true';
    const fahrzeuge = await Vehicle.find(filter).sort({ standort: 1, nummernschild: 1 });
    res.json(fahrzeuge);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/fahrzeuge — Fahrzeug anlegen
router.post('/', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.create(req.body);
    res.status(201).json(fahrzeug);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Nummernschild bereits vorhanden' });
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/fahrzeuge/:id — Fahrzeug bearbeiten
router.put('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!fahrzeug) return res.status(404).json({ message: 'Fahrzeug nicht gefunden' });
    res.json(fahrzeug);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Nummernschild bereits vorhanden' });
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/fahrzeuge/:id — Fahrzeug löschen
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.findByIdAndDelete(req.params.id);
    if (!fahrzeug) return res.status(404).json({ message: 'Fahrzeug nicht gefunden' });
    // Alle Dateien des Fahrzeugs löschen
    for (const doc of fahrzeug.dokumente || []) {
      const p = path.join(uploadDir, doc.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    res.json({ message: 'Fahrzeug gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/fahrzeuge/:id/dokumente — Dokumentenliste
router.get('/:id/dokumente', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.findById(req.params.id).populate('dokumente.hochgeladenVon', 'name');
    if (!fahrzeug) return res.status(404).json({ message: 'Fahrzeug nicht gefunden' });
    res.json(fahrzeug.dokumente);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/fahrzeuge/:id/dokumente — Dokument hochladen
router.post('/:id/dokumente', auth, requireRole('administrator'), upload.single('datei'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.findById(req.params.id);
    if (!fahrzeug) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Fahrzeug nicht gefunden' });
    }
    if (!req.file) return res.status(400).json({ message: 'Keine Datei hochgeladen' });

    fahrzeug.dokumente.push({
      name:          req.body.name || req.file.originalname,
      originalname:  req.file.originalname,
      filename:      req.file.filename,
      mimetype:      req.file.mimetype,
      size:          req.file.size,
      hochgeladenVon: req.user._id,
    });
    await fahrzeug.save();
    const newDoc = fahrzeug.dokumente[fahrzeug.dokumente.length - 1];
    res.status(201).json(newDoc);
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/fahrzeuge/:id/dokumente/:docId — Dokument löschen
router.delete('/:id/dokumente/:docId', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrzeug = await Vehicle.findById(req.params.id);
    if (!fahrzeug) return res.status(404).json({ message: 'Fahrzeug nicht gefunden' });

    const doc = fahrzeug.dokumente.id(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Dokument nicht gefunden' });

    const filePath = path.join(uploadDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    doc.deleteOne();
    await fahrzeug.save();
    res.json({ message: 'Dokument gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
