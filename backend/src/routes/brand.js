const express = require('express');
const BrandSettings = require('../models/BrandSettings');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// ─── PUBLIC (no auth needed) ──────────────────────────────────────────────────

// GET /api/brand/public – minimal public settings for login page + CSS vars
router.get('/public', async (req, res) => {
  try {
    const settings = await BrandSettings.getSingleton();
    res.json({
      appName: settings.appName,
      appSubtitle: settings.appSubtitle,
      companyName: settings.companyName,
      colors: settings.colors,
      logos: {
        login: settings.logos?.login || null,
        icon: settings.logos?.icon || null,
        sidebar: settings.logos?.sidebar || null,
      },
      login: settings.login,
      footer: settings.footer,
      features: settings.features,
      customCss: settings.customCss,
    });
  } catch (err) {
    // Fallback to defaults on error
    res.json({
      appName: 'Orderdesk',
      appSubtitle: 'Lieferschein Disposition',
      colors: { primary: '#f48a1a', primaryDark: '#c0560c', sidebar: '#0f172a' },
    });
  }
});

// GET /api/brand/favicon – serve favicon as binary
router.get('/favicon', async (req, res) => {
  try {
    const settings = await BrandSettings.getSingleton();
    if (!settings.favicon) {
      return res.status(404).end();
    }
    // favicon can be "data:image/png;base64,..." or a URL
    if (settings.favicon.startsWith('data:')) {
      const [meta, data] = settings.favicon.split(',');
      const mimeMatch = meta.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/x-icon';
      const buffer = Buffer.from(data, 'base64');
      res.set('Content-Type', mime);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    }
    // External URL – redirect
    return res.redirect(settings.favicon);
  } catch {
    res.status(404).end();
  }
});

// GET /api/brand/css – inject custom CSS as text/css
router.get('/css', async (req, res) => {
  try {
    const settings = await BrandSettings.getSingleton();
    const { primary, primaryDark, primaryLight, sidebar, sidebarText, sidebarActive } = settings.colors || {};

    // Generate CSS custom properties from brand settings
    const generatedVars = `
:root {
  --brand-primary: ${primary || '#f48a1a'};
  --brand-primary-dark: ${primaryDark || '#c0560c'};
  --brand-primary-light: ${primaryLight || '#fef3e2'};
  --brand-sidebar: ${sidebar || '#0f172a'};
  --brand-sidebar-text: ${sidebarText || '#94a3b8'};
  --brand-sidebar-active: ${sidebarActive || '#f48a1a'};
}
`.trim();

    res.set('Content-Type', 'text/css');
    res.set('Cache-Control', 'no-cache');
    res.send(generatedVars + '\n' + (settings.customCss || ''));
  } catch {
    res.set('Content-Type', 'text/css');
    res.send('');
  }
});

// ─── PROTECTED (admin only) ───────────────────────────────────────────────────

// GET /api/brand/settings – full settings for admin panel
router.get('/settings', auth, requireRole('administrator'), async (req, res) => {
  try {
    const settings = await BrandSettings.getSingleton();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/brand/settings – partial update (main workhorse)
router.patch('/settings', auth, requireRole('administrator'), async (req, res) => {
  try {
    const settings = await BrandSettings.getSingleton();
    const allowed = ['appName', 'appSubtitle', 'companyName', 'colors', 'logos',
      'favicon', 'login', 'customCss', 'footer', 'features'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] === 'object' && !Array.isArray(req.body[key]) && req.body[key] !== null) {
          // Deep merge for nested objects
          settings[key] = { ...settings[key]?.toObject?.() || settings[key], ...req.body[key] };
        } else {
          settings[key] = req.body[key];
        }
      }
    }
    settings.updatedBy = req.user._id;
    await settings.save();

    await createAuditLog({
      benutzer: req.user._id,
      benutzerName: req.user.name,
      aktion: 'lieferschein_geaendert', // reuse closest action type
      details: { beschreibung: 'Whitelabel-Einstellungen aktualisiert' },
      req
    });

    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/brand/reset – reset to defaults
router.post('/reset', auth, requireRole('administrator'), async (req, res) => {
  try {
    await BrandSettings.deleteOne({ _singleton: true });
    const fresh = await BrandSettings.getSingleton();
    res.json(fresh);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/brand/upload-logo – upload a logo as base64
// body: { type: 'sidebar'|'login'|'icon'|'print', data: 'data:image/png;base64,...' }
router.post('/upload-logo', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { type, data } = req.body;
    const validTypes = ['sidebar', 'login', 'icon', 'print'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Ungültiger Logo-Typ' });
    }
    if (!data || !data.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Ungültige Bilddaten' });
    }
    // Rough size check: base64 of 1MB = ~1.37MB string
    if (data.length > 2_000_000) {
      return res.status(400).json({ message: 'Bild zu groß (max. 1.5 MB)' });
    }

    const settings = await BrandSettings.getSingleton();
    if (!settings.logos) settings.logos = {};
    settings.logos[type] = data;
    settings.markModified('logos');
    await settings.save();

    res.json({ message: 'Logo gespeichert', type });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/brand/upload-favicon
router.post('/upload-favicon', auth, requireRole('administrator'), async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Ungültige Favicon-Daten' });
    }
    const settings = await BrandSettings.getSingleton();
    settings.favicon = data;
    await settings.save();
    res.json({ message: 'Favicon gespeichert' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
