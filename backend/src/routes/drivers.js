const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Driver = require('../models/Driver');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/fahrer');
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

// GET /api/fahrer/dokumente/:filename — Datei anzeigen (vor /:id-Routen!)
router.get('/dokumente/:filename', auth, requireRole('administrator', 'disponent', 'lagerist'), (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Datei nicht gefunden' });
  res.sendFile(filePath);
});

// GET /api/fahrer — alle Fahrer
router.get('/', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const { standort, aktiv } = req.query;
    const filter = {};
    if (standort) filter.standort = standort;
    if (aktiv !== undefined) filter.aktiv = aktiv === 'true';
    const fahrer = await Driver.find(filter).sort({ nachname: 1, vorname: 1 });
    res.json(fahrer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/fahrer — Fahrer anlegen
router.post('/', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrer = await Driver.create(req.body);
    res.status(201).json(fahrer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/fahrer/:id — Fahrer bearbeiten
router.put('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrer = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!fahrer) return res.status(404).json({ message: 'Fahrer nicht gefunden' });
    res.json(fahrer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/fahrer/:id — Fahrer löschen
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrer = await Driver.findByIdAndDelete(req.params.id);
    if (!fahrer) return res.status(404).json({ message: 'Fahrer nicht gefunden' });
    for (const doc of fahrer.dokumente || []) {
      const p = path.join(uploadDir, doc.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    res.json({ message: 'Fahrer gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/fahrer/:id/dokumente
router.get('/:id/dokumente', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const fahrer = await Driver.findById(req.params.id).populate('dokumente.hochgeladenVon', 'name');
    if (!fahrer) return res.status(404).json({ message: 'Fahrer nicht gefunden' });
    res.json(fahrer.dokumente);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/fahrer/:id/dokumente — Dokument hochladen
router.post('/:id/dokumente', auth, requireRole('administrator'), upload.single('datei'), async (req, res) => {
  try {
    const fahrer = await Driver.findById(req.params.id);
    if (!fahrer) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Fahrer nicht gefunden' });
    }
    if (!req.file) return res.status(400).json({ message: 'Keine Datei hochgeladen' });
    fahrer.dokumente.push({
      name:          req.body.name || req.file.originalname,
      originalname:  req.file.originalname,
      filename:      req.file.filename,
      mimetype:      req.file.mimetype,
      size:          req.file.size,
      hochgeladenVon: req.user._id,
    });
    await fahrer.save();
    res.status(201).json(fahrer.dokumente[fahrer.dokumente.length - 1]);
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/fahrer/:id/dokumente/:docId
router.delete('/:id/dokumente/:docId', auth, requireRole('administrator'), async (req, res) => {
  try {
    const fahrer = await Driver.findById(req.params.id);
    if (!fahrer) return res.status(404).json({ message: 'Fahrer nicht gefunden' });
    const doc = fahrer.dokumente.id(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Dokument nicht gefunden' });
    const filePath = path.join(uploadDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    doc.deleteOne();
    await fahrer.save();
    res.json({ message: 'Dokument gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
