const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');

const router = express.Router();

const REPO = process.env.GITHUB_REPO || 'mauschi799/orderdesk';
const BRANCH = 'main';
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
  const res = await axios.get(`https://api.github.com/repos/${REPO}${path}`, { headers, timeout: 6000 });
  return res.data;
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
    commit: run.commit,
    shortCommit: run.commit ? run.commit.slice(0, 7) : null,
    buildDate: run.buildDate,
    repo: REPO,
  };
  if (req.user.role !== 'administrator') return res.json(base);

  const force = req.query.refresh === '1';
  const age = Date.now() - cache.at;
  const usable = cache.data && cache.key === run.commit && age < (force ? MIN_REFRESH_MS : CACHE_MS);
  if (usable) return res.json({ ...base, ...cache.data, checkedAt: new Date(cache.at).toISOString() });

  try {
    const latest = await checkLatest(run.commit);
    const data = {
      latest: { ...latest, shortCommit: latest.latestCommit.slice(0, 7) },
      updateAvailable: latest.status === 'unknown'
        ? latest.latestCommit !== run.commit
        : latest.behindBy > 0,
      checkError: null,
    };
    cache = { at: Date.now(), key: run.commit, data };
    res.json({ ...base, ...data, checkedAt: new Date(cache.at).toISOString() });
  } catch (err) {
    const status = err.response?.status;
    const msg = status === 404
      ? 'Repo oder Commit auf GitHub nicht gefunden (privates Repo? GITHUB_TOKEN setzen)'
      : status === 403 ? 'GitHub-Rate-Limit erreicht, später erneut versuchen'
      : `GitHub nicht erreichbar: ${err.message}`;
    res.json({ ...base, latest: null, updateAvailable: null, checkError: msg });
  }
});

module.exports = router;
