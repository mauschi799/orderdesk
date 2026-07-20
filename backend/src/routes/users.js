const express = require('express');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// GET /api/users
router.get('/', auth, requireRole('administrator'), async (req, res) => {
  try {
    const users = await User.find().sort('name');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users
router.post('/', auth, requireRole('administrator'), async (req, res) => {
  try {
    const user = await User.create({
      ...req.body,
      createdBy: req.user._id
    });

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'benutzer_erstellt',
      details: { beschreibung: `Benutzer ${user.username} erstellt` },
      req
    });

    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Benutzername bereits vergeben' });
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { pin, ...updateData } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Benutzer nicht gefunden' });

    Object.assign(user, updateData);
    if (pin) user.pin = pin;
    await user.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'benutzer_geaendert',
      details: { beschreibung: `Benutzer ${user.username} geändert` },
      req
    });

    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, requireRole('administrator'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Eigenen Account nicht löschbar' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Benutzer nicht gefunden' });

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'benutzer_geloescht',
      details: { beschreibung: `Benutzer ${user.username} gelöscht` },
      req
    });

    res.json({ message: 'Benutzer gelöscht' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
