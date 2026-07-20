const express = require('express');
const axios   = require('axios');
const https   = require('https');
const { auth, requireRole } = require('../middleware/auth');
const { ensureToken } = require('../services/selectlineService');

const router = express.Router();

// Nur Administratoren
router.use(auth, requireRole('administrator'));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// POST /api/debug/selectline
// Proxied SelectLine API-Aufruf (nutzt gecachten Auth-Token)
router.post('/selectline', async (req, res) => {
  const { path = '/', method = 'GET', body } = req.body;

  try {
    const { token, tokenType, baseUrl } = await ensureToken();
    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const start = Date.now();

    const response = await axios({
      method: method.toLowerCase(),
      url,
      data: body || undefined,
      headers: {
        Authorization: `${tokenType} ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      httpsAgent: process.env.SELECTLINE_IGNORE_SSL === 'true' ? httpsAgent : undefined,
      timeout: 15_000,
      validateStatus: () => true, // alle Status-Codes durchlassen
    });

    res.json({
      status: response.status,
      statusText: response.statusText,
      duration: Date.now() - start,
      url,
      data: response.data,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      code: err.code,
    });
  }
});

// POST /api/debug/intern
// Direkter Aufruf interner API-Endpunkte (Backend ruft sich selbst auf)
router.post('/intern', async (req, res) => {
  const { path = '/', method = 'GET', body } = req.body;

  try {
    // Auth-Token aus dem Request weitergeben
    const token = req.headers.authorization;
    const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const start = Date.now();

    const response = await axios({
      method: method.toLowerCase(),
      url,
      data: body || undefined,
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
      validateStatus: () => true,
    });

    res.json({
      status: response.status,
      statusText: response.statusText,
      duration: Date.now() - start,
      url,
      data: response.data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code });
  }
});

module.exports = router;
