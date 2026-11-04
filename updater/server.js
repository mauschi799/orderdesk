/**
 * Orderdesk Updater
 *
 * Kleiner, abhängigkeitsfreier Dienst, der auf Anforderung des Backends die
 * neueste Version aus dem Git-Repo holt und Backend/Frontend neu baut und startet.
 *
 * Sicherheit:
 *  - Nur im internen Docker-Netz erreichbar (kein `ports:` in docker-compose.yml)
 *  - Jede Anfrage braucht den geheimen Header X-Updater-Token (UPDATER_TOKEN)
 *  - Es werden ausschließlich festverdrahtete Befehle ausgeführt, keine Eingaben
 *    von außen fließen in Kommandos ein
 *
 * Ablauf: Repo sauber? -> git fetch -> fast-forward -> bauen -> (erst bei Erfolg)
 * Container neu starten -> Health-Check -> bei Fehlschlag automatisch zurückrollen.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const cfg = {
  port: Number(process.env.PORT || 4000),
  token: process.env.UPDATER_TOKEN || '',
  repo: process.env.REPO_DIR || '/repo',
  branch: process.env.UPDATE_BRANCH || 'main',
  services: (process.env.UPDATE_SERVICES || 'backend frontend').split(/\s+/).filter(Boolean),
  healthUrl: process.env.HEALTH_URL || 'http://backend:5000/api/health',
  healthTimeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 120000),
  stateFile: process.env.STATE_FILE || '/state/status.json',
  githubToken: process.env.GITHUB_TOKEN || '',
  docker: process.env.DOCKER_BIN || 'docker',
  git: process.env.GIT_BIN || 'git',
};

const MAX_LOG_LINES = 400;
let state = { state: 'idle', step: null, log: [] };
let running = false;

// ── State ────────────────────────────────────────────────────────────────────
const persist = () => {
  try {
    fs.mkdirSync(path.dirname(cfg.stateFile), { recursive: true });
    fs.writeFileSync(cfg.stateFile, JSON.stringify(state));
  } catch { /* State-Volume optional */ }
};

const loadState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8'));
    if (s.state === 'running') {
      s.state = 'failed';
      s.error = 'Der Updater wurde während des Updates neu gestartet - bitte Zustand prüfen (docker compose ps).';
      s.finishedAt = new Date().toISOString();
    }
    state = s;
  } catch { /* erster Start */ }
};

const mask = (text) => {
  let t = String(text);
  for (const secret of [cfg.githubToken, cfg.token]) if (secret) t = t.split(secret).join('***');
  return t;
};

const log = (line) => {
  for (const l of mask(line).split('\n')) {
    if (!l.trim()) continue;
    state.log.push(l);
  }
  if (state.log.length > MAX_LOG_LINES) state.log = state.log.slice(-MAX_LOG_LINES);
};

const step = (name) => { state.step = name; log(`▶ ${name}`); persist(); };

// ── Prozesse ─────────────────────────────────────────────────────────────────
const run = (cmd, args, { env = {}, logArgs = args, allowFail = false } = {}) =>
  new Promise((resolve, reject) => {
    log(`$ ${path.basename(cmd)} ${logArgs.join(' ')}`);
    const child = spawn(cmd, args, { cwd: cfg.repo, env: { ...process.env, ...env } });
    let out = '';
    const onData = (d) => { out += d; log(d.toString()); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => reject(new Error(`${cmd}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 || allowFail) return resolve({ code, out: out.trim() });
      const sub = logArgs[0] === 'compose' ? `compose ${logArgs.find(a => ['build', 'up'].includes(a)) || ''}`.trim() : (logArgs[0] || '');
      const lastLine = out.trim().split('\n').filter(Boolean).pop();
      reject(new Error(`${path.basename(cmd)} ${sub} fehlgeschlagen (Exit ${code})${lastLine ? `: ${mask(lastLine).slice(0, 200)}` : ''}`));
    });
  });

// git mit optionalem Token (privates Repo); Token taucht nicht im Log auf
const git = (args, opts = {}) => {
  const auth = cfg.githubToken
    ? ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${cfg.githubToken}`).toString('base64')}`]
    : [];
  return run(cfg.git, [...auth, ...args], { logArgs: args, ...opts });
};

let projectName = process.env.COMPOSE_PROJECT_NAME || null;
const getProjectName = async () => {
  if (projectName) return projectName;
  // Projektname aus dem eigenen Compose-Label ermitteln, damit dieselben Container angesprochen werden
  const { out } = await run(cfg.docker, ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', process.env.HOSTNAME || ''], { allowFail: true });
  projectName = out && out !== '<no value>' ? out : path.basename(cfg.repo);
  return projectName;
};

const compose = async (args, env) => {
  const project = await getProjectName();
  return run(cfg.docker, ['compose', '-p', project, '--project-directory', cfg.repo, '-f', path.join(cfg.repo, 'docker-compose.yml'), ...args], { env });
};

// Das Repo wird im Container als root bearbeitet - Eigentümer wieder auf den Host-Nutzer setzen,
// sonst scheitert ein späteres manuelles `git pull` auf dem Server an Berechtigungen.
const fixOwnership = async () => {
  try {
    const st = fs.statSync(cfg.repo);
    await run('chown', ['-R', `${st.uid}:${st.gid}`, cfg.repo], { allowFail: true });
  } catch { /* nicht kritisch */ }
};

const waitForHealth = async (expectedCommit) => {
  const deadline = Date.now() + cfg.healthTimeoutMs;
  let last = 'keine Antwort';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(cfg.healthUrl, { signal: AbortSignal.timeout(4000) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status === 'ok') {
        if (!expectedCommit || body.commit === expectedCommit) return true;
        last = `Backend meldet Version ${String(body.commit).slice(0, 7)}, erwartet ${expectedCommit.slice(0, 7)}`;
      } else last = `HTTP ${res.status}`;
    } catch (err) { last = err.message; }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Health-Check fehlgeschlagen: ${last}`);
};

// `onRestart` wird unmittelbar vor dem Neustart aufgerufen: ab da laufen die Container
// nicht mehr mit der alten Version (relevant fürs Rollback)
const buildAndStart = async (commit, onRestart = () => {}) => {
  const env = { GIT_COMMIT: commit, BUILD_DATE: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  step('Images bauen');
  await compose(['build', ...cfg.services], env);
  step('Container neu starten');
  onRestart();
  await compose(['up', '-d', '--no-deps', ...cfg.services], env);
};

// ── Update-Job ───────────────────────────────────────────────────────────────
const runUpdate = async (triggeredBy) => {
  running = true;
  state = {
    id: crypto.randomUUID(), state: 'running', step: 'Vorbereitung', startedAt: new Date().toISOString(),
    finishedAt: null, triggeredBy: triggeredBy || null, fromCommit: null, toCommit: null,
    rolledBack: false, error: null, log: [],
  };
  persist();
  let switched = false;
  let restarted = false;

  try {
    step('Repository prüfen');
    await git(['config', '--global', '--add', 'safe.directory', cfg.repo], { allowFail: true });
    const status = await run(cfg.git, ['status', '--porcelain'], {});
    if (status.out) throw new Error('Im Repository auf dem Server gibt es lokale Änderungen - Update abgebrochen, bitte manuell klären.');
    state.fromCommit = (await run(cfg.git, ['rev-parse', 'HEAD'])).out;

    step('Neueste Version von GitHub holen');
    await git(['fetch', 'origin', cfg.branch]);
    state.toCommit = (await run(cfg.git, ['rev-parse', `origin/${cfg.branch}`])).out;
    if (state.toCommit === state.fromCommit) {
      state.state = 'success';
      state.step = 'Bereits aktuell';
      log('Es gibt keine neuere Version.');
      return;
    }

    step('Code aktualisieren');
    await run(cfg.git, ['merge', '--ff-only', `origin/${cfg.branch}`]);
    switched = true;
    await fixOwnership();

    // Ein Build-Fehler lässt die laufenden Container unangetastet
    await buildAndStart(state.toCommit, () => { restarted = true; });

    step('Neue Version prüfen');
    await waitForHealth(state.toCommit);

    state.state = 'success';
    state.step = 'Update abgeschlossen';
    log(`✓ Update auf ${state.toCommit.slice(0, 7)} abgeschlossen`);
  } catch (err) {
    state.error = err.message;
    log(`✗ ${err.message}`);
    if (switched && state.fromCommit) {
      try {
        step('Fehler - zurück auf vorherige Version');
        await run(cfg.git, ['reset', '--hard', state.fromCommit]);
        await fixOwnership();
        if (restarted) {
          // Container laufen bereits mit der neuen (fehlerhaften) Version -> alte neu bauen/starten
          await buildAndStart(state.fromCommit);
          await waitForHealth(null);
        } else {
          log('Build fehlgeschlagen, die laufenden Container wurden nicht verändert.');
        }
        state.rolledBack = true;
        log(`↩ Zurückgerollt auf ${state.fromCommit.slice(0, 7)}`);
      } catch (rbErr) {
        state.error += ` | Rollback fehlgeschlagen: ${rbErr.message}`;
        log(`✗ Rollback fehlgeschlagen: ${rbErr.message}`);
      }
    }
    state.state = 'failed';
  } finally {
    state.finishedAt = new Date().toISOString();
    running = false;
    persist();
  }
};

// ── HTTP ─────────────────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const authorized = (req) => {
  if (!cfg.token) return false;
  return crypto.timingSafeEqual(sha(req.headers['x-updater-token'] || ''), sha(cfg.token));
};

const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const publicState = () => ({ ...state, log: state.log.slice(-150) });

const server = http.createServer(async (req, res) => {
  if (!cfg.token) return send(res, 503, { message: 'UPDATER_TOKEN nicht gesetzt' });
  if (!authorized(req)) return send(res, 401, { message: 'Nicht autorisiert' });

  if (req.method === 'GET' && req.url === '/status') return send(res, 200, publicState());

  if (req.method === 'POST' && req.url === '/update') {
    if (running) return send(res, 409, { message: 'Es läuft bereits ein Update', ...publicState() });
    let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let by = null;
      try { by = JSON.parse(raw || '{}').triggeredBy || null; } catch { /* ignorieren */ }
      runUpdate(by).catch(err => console.error('Update-Fehler:', err));
      send(res, 202, { message: 'Update gestartet' });
    });
    return;
  }
  send(res, 404, { message: 'Nicht gefunden' });
});

if (require.main === module) {
  loadState();
  server.listen(cfg.port, () => console.log(`Orderdesk Updater läuft auf Port ${cfg.port} (Repo: ${cfg.repo})`));
}

module.exports = { server, cfg };
