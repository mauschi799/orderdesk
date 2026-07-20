const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// POST /api/auth/login
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Benutzername erforderlich'),
  body('pin').isLength({ min: 4 }).withMessage('PIN muss mindestens 4 Zeichen haben')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, pin } = req.body;
    const user = await User.findOne({ username: username.toLowerCase(), isActive: true }).select('+pin');

    if (!user || !(await user.comparePin(pin))) {
      return res.status(401).json({ message: 'Ungültiger Benutzername oder PIN' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await User.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastActivity: new Date()
    });

    await createAuditLog({
      benutzer: user._id,
      benutzerName: user.name,
      aktion: 'login',
      req
    });

    res.json({
      token,
      user: user.toJSON(),
      permissions: User.getRolePermissions(user.role)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', auth, async (req, res) => {
  await createAuditLog({
    benutzer: req.user._id,
    benutzerName: req.user.name,
    aktion: 'logout',
    req
  });
  res.json({ message: 'Erfolgreich abgemeldet' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({
    user: req.user,
    permissions: User.getRolePermissions(req.user.role)
  });
});

// POST /api/auth/change-pin
router.post('/change-pin', auth, [
  body('currentPin').isLength({ min: 4 }),
  body('newPin').isLength({ min: 4 })
], async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+pin');
    const { currentPin, newPin } = req.body;

    if (!(await user.comparePin(currentPin))) {
      return res.status(400).json({ message: 'Aktuelle PIN ist falsch' });
    }

    user.pin = newPin;
    await user.save();

    res.json({ message: 'PIN erfolgreich geändert' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
