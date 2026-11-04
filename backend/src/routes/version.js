const express = require('express');
const axios = require('axios');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();

// Versionsnummer: einzige Quelle ist backend/package.json (wird bei jedem Release erhöht)
const APP_VERSION = require('../../package.json').version;

const REPO = process.env.GITHUB_REPO || 'mauschi799/orderdesk';
const BRANCH = 'main';
const GITHUB_API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const UPDATER_URL = (process.env.UPDATER_URL || 'http://updater:4000').replace(/\/$/, '');
const CACHE_MS = 5 * 60 * 1000;      // GitHub-API ohne Token: nur 60 Anfragen/Stunde
const MIN_REFRESH_MS = 30 * 1000;    // "Erneut prüfen" höchstens alle 30s

let cache = { at: 0, key: null, data: null };

const running = () => ({
  commit: process.env.GIT_COMMIT && process.env.GIT_COMMIT !== 'unknown' ? process.env.GIT_COMMIT : null,
  buildDate: process.env.BUILD_DATE && process.env.BUILD_DATE !== 'unknown' ? process.env.BUILD_DATE : null,
});

const ghGet = async (path) => {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'orderdesk-version-check' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await axios.get(`${GITHUB_API}/repos/${REPO}${path}`, { headers, timeout: 6000 });
  return res.data;
};

// Versionsnummer, die aktuell auf main steht (null, wenn nicht ermittelbar)
const fetchLatestVersion = async () => {
  try {
    const file = await ghGet(`/contents/backend/package.json?ref=${BRANCH}`);
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).version || null;
  } catch { return null; }
};

// ── Changelog (CHANGELOG.md im Repo) ─────────────────────────────────────────
const semverParts = (v) => String(v).split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
const compareSemver = (a, b) => {
  const pa = semverParts(a), pb = semverParts(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  return 0;
};

// Liest "## [1.2.0] - 2026-11-04" + "### Kategorie" + "- Eintrag" aus dem Markdown
const parseChangelog = (md) => {
  const versions = [];
  let cur = null, cat = null;
  for (const line of String(md).split('\n')) {
    const v = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?\s*(?:[-–—]\s*(\S+))?/.exec(line);
    if (v) { cur = { version: v[1], date: v[2] || null, items: [] }; versions.push(cur); cat = null; continue; }
    if (!cur) continue;
    const c = /^###\s+(.+)$/.exec(line);
    if (c) { cat = c[1].trim(); continue; }
    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (item) cur.items.push({ text: item[1].trim(), kategorie: cat });
  }
  return versions;
};

// Änderungen aller Versionen, die neuer sind als die installierte (neueste zuerst)
const fetchChangelogSince = async (installedVersion) => {
  try {
    const file = await ghGet(`/contents/CHANGELOG.md?ref=${BRANCH}`);
    const md = Buffer.from(file.content, 'base64').toString('utf8');
    return parseChangelog(md)
      .filter(v => compareSemver(v.version, installedVersion) > 0)
      .sort((a, b) => compareSemver(b.version, a.version))
      .slice(0, 15);
  } catch { return []; }
};

const firstLine = (msg = '') => String(msg).split('\n')[0];

// Vergleicht die laufende Version mit dem aktuellen Stand von GitHub
const checkLatest = async (runningCommit) => {
  if (runningCommit) {
    // ahead_by = so viele Commits liegen auf main, die hier noch fehlen
    const cmp = await ghGet(`/compare/${runningCommit}...${BRANCH}`);
    const commits = (cmp.commits || []).slice(-15).reverse();
    return {
      latestCommit: cmp.commits?.length ? cmp.commits[cmp.commits.length - 1].sha : runningCommit,
      status: cmp.status,                       // identical | ahead | behind | diverged
      behindBy: cmp.status === 'ahead' || cmp.status === 'diverged' ? cmp.ahead_by : 0,
      changes: commits.map(c => ({
        sha: c.sha.slice(0, 7),
        message: firstLine(c.commit?.message),
        date: c.commit?.author?.date,
      })),
    };
  }
  // Laufender Commit unbekannt (z.B. ohne update.sh gebaut): nur den neuesten anzeigen
  const latest = await ghGet(`/commits/${BRANCH}`);
  return {
    latestCommit: latest.sha,
    status: 'unknown',
    behindBy: null,
    changes: [{ sha: latest.sha.slice(0, 7), message: firstLine(latest.commit?.message), date: latest.commit?.author?.date }],
  };
};

// GET /api/version - laufende Version (alle) + Update-Verfügbarkeit (nur Administratoren)
router.get('/', auth, async (req, res) => {
  const run = running();
  const base = {
    version: APP_VERSION,
    commit: run.commit,
    shortCommit: run.commit ? run.commit.slice(0, 7) : null,
    buildDate: run.buildDate,
    repo: REPO,
  };
  if (req.user.role !== 'administrator') return res.json(base);

  const force = req.query.refresh === '1';
  const age = Date.now() - cache.at;
  const usable = cache.data && cache.key === run.commit && age < (force ? MIN_REFRESH_MS : CACHE_MS);
  const updaterConfigured = !!process.env.UPDATER_TOKEN;
  if (usable) return res.json({ ...base, ...cache.data, updaterConfigured, checkedAt: new Date(cache.at).toISOString() });

  try {
    const [latest, latestVersion, changelog] = await Promise.all([
      checkLatest(run.commit), fetchLatestVersion(), fetchChangelogSince(APP_VERSION),
    ]);
    const data = {
      latest: { ...latest, shortCommit: latest.latestCommit.slice(0, 7), version: latestVersion, changelog },
      // Commit der laufenden Version unbekannt (Images nicht über ./update.sh gebaut):
      // dann nur über die Versionsnummer vergleichbar, nicht pauschal "Update verfügbar"
      updateAvailable: latest.status === 'unknown'
        ? (latestVersion ? compareSemver(latestVersion, APP_VERSION) > 0 : null)
        : latest.behindBy > 0,
      checkError: null,
    };
    cache = { at: Date.now(), key: run.commit, data };
    res.json({ ...base, ...data, updaterConfigured, checkedAt: new Date(cache.at).toISOString() });
  } catch (err) {
    const status = err.response?.status;
    const msg = status === 404
      ? 'Repo oder Commit auf GitHub nicht gefunden (privates Repo? GITHUB_TOKEN setzen)'
      : status === 403 ? 'GitHub-Rate-Limit erreicht, später erneut versuchen'
      : `GitHub nicht erreichbar: ${err.message}`;
    res.json({ ...base, latest: null, updateAvailable: null, updaterConfigured, checkError: msg });
  }
});

// ── Update auslösen (Updater-Container) ──────────────────────────────────────
const updaterRequest = (method, path, data) => axios({
  method, url: `${UPDATER_URL}${path}`, data, timeout: 8000,
  headers: { 'X-Updater-Token': process.env.UPDATER_TOKEN || '' },
  validateStatus: () => true,
});

// GET /api/version/update-status - Fortschritt des laufenden/letzten Updates
router.get('/update-status', auth, requireRole('administrator'), async (req, res) => {
  if (!process.env.UPDATER_TOKEN) return res.json({ state: 'not_configured' });
  try {
    const r = await updaterRequest('get', '/status');
    if (r.status !== 200) return res.json({ state: 'unreachable', message: r.data?.message || `HTTP ${r.status}` });
    res.json(r.data);
  } catch (err) {
    // Während des Neustarts von Backend/Updater erwartbar
    res.json({ state: 'unreachable', message: err.message });
  }
});

// POST /api/version/update - "Version aktualisieren"
router.post('/update', auth, requireRole('administrator'), async (req, res) => {
  if (!process.env.UPDATER_TOKEN) {
    return res.status(400).json({ message: 'Updater nicht eingerichtet (UPDATER_TOKEN fehlt in der .env, ./update.sh einmal manuell ausführen)' });
  }
  try {
    const r = await updaterRequest('post', '/update', { triggeredBy: req.user.name });
    if (r.status === 409) return res.status(409).json({ message: 'Es läuft bereits ein Update' });
    if (r.status !== 202) return res.status(502).json({ message: r.data?.message || `Updater antwortete mit HTTP ${r.status}` });
    await createAuditLog({
      benutzer: req.user._id, benutzerName: req.user.name, aktion: 'system_update',
      details: { beschreibung: `Update gestartet (laufende Version ${process.env.GIT_COMMIT ? process.env.GIT_COMMIT.slice(0, 7) : 'unbekannt'})` }, req,
    });
    res.status(202).json({ message: 'Update gestartet' });
  } catch (err) {
    res.status(502).json({ message: `Updater nicht erreichbar (läuft der updater-Container?): ${err.message}` });
  }
});

module.exports = router;
module.exports.parseChangelog = parseChangelog;
module.exports.compareSemver = compareSemver;
