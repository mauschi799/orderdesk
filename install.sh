#!/bin/bash
set -e

# ── Farben ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      GasDispo – Installations-Setup      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Voraussetzungen prüfen ────────────────────────────────────────────────────
check() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $2 ist nicht installiert.${NC}"
    echo "  $3"
    exit 1
  fi
}

check docker    "Docker"         "https://docs.docker.com/engine/install/"
check openssl   "openssl"        "sudo apt install openssl"

if ! docker compose version &>/dev/null; then
  echo -e "${RED}✗ Docker Compose v2 fehlt.${NC}"
  echo "  https://docs.docker.com/compose/install/"
  exit 1
fi

echo -e "${GREEN}✓ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)${NC}"
echo -e "${GREEN}✓ Docker Compose $(docker compose version --short 2>/dev/null || echo 'v2')${NC}"
echo ""

# ── Bestehende .env schützen ──────────────────────────────────────────────────
if [ -f ".env" ]; then
  read -rp "⚠  .env existiert bereits. Überschreiben? [j/N] " OW
  [[ "$OW" =~ ^[jJ]$ ]] || { echo "Abgebrochen."; exit 0; }
fi

# ── Konfiguration abfragen ────────────────────────────────────────────────────
echo -e "${CYAN}── Server ──────────────────────────────────────────────────${NC}"
read -rp "  Server-IP oder Domain [localhost]: " SERVER_HOST
SERVER_HOST=${SERVER_HOST:-localhost}

read -rp "  Frontend-Port [3000]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-3000}

echo ""
echo -e "${CYAN}── SelectLine API ──────────────────────────────────────────${NC}"
read -rp "  API-URL (z.B. http://192.168.1.50:5001/api/v1): " SL_URL
read -rp "  Benutzername: " SL_USER
read -rsp "  Passwort: " SL_PASS; echo ""
read -rp "  Mandant: " SL_MANDANT
read -rp "  SSL-Zertifikat ignorieren? [j/N]: " SL_SSL
SL_SSL=$([[ "$SL_SSL" =~ ^[jJ]$ ]] && echo "true" || echo "false")

echo ""
echo -e "${CYAN}── Push-Benachrichtigungen (VAPID) ─────────────────────────${NC}"
read -rp "  Kontakt-E-Mail [admin@example.com]: " VAPID_EMAIL
VAPID_EMAIL=${VAPID_EMAIL:-admin@example.com}

# ── JWT-Secret generieren ─────────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)

# ── .env schreiben ────────────────────────────────────────────────────────────
cat > .env <<EOF
# ── Sicherheit ────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
AUTO_LOGOUT_MINUTES=60

# ── URLs ──────────────────────────────────────────────────────────────────────
FRONTEND_URL=http://${SERVER_HOST}:${FRONTEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}

# ── SelectLine ────────────────────────────────────────────────────────────────
SELECTLINE_API_URL=${SL_URL}
SELECTLINE_USERNAME=${SL_USER}
SELECTLINE_PASSWORD=${SL_PASS}
SELECTLINE_MANDANT=${SL_MANDANT}
SELECTLINE_IGNORE_SSL=${SL_SSL}

# ── Web Push / VAPID (wird automatisch befüllt) ───────────────────────────────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:${VAPID_EMAIL}
EOF

echo ""
echo -e "${GREEN}✓ .env erstellt${NC}"

# ── Docker Build & Start ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}── Container werden gebaut ─────────────────────────────────${NC}"
docker compose build --no-cache

echo ""
echo -e "${CYAN}── Container werden gestartet ──────────────────────────────${NC}"
docker compose up -d

# ── Warten bis MongoDB bereit ist ────────────────────────────────────────────
echo ""
echo -n "  Warte auf MongoDB"
for i in {1..30}; do
  docker exec gasdispo-mongo mongosh --quiet --eval "db.adminCommand('ping')" &>/dev/null && break
  echo -n "."
  sleep 2
done
echo ""
echo -e "${GREEN}✓ MongoDB bereit${NC}"

# ── VAPID-Schlüssel generieren ────────────────────────────────────────────────
echo ""
echo -n "  VAPID-Schlüssel werden generiert..."
VAPID_JSON=$(docker exec gasdispo-backend node -e \
  "try{const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(JSON.stringify(k));}catch(e){console.log('{}');}" \
  2>/dev/null || echo '{}')

VPUB=$(echo "$VAPID_JSON" | grep -oP '"publicKey":"\K[^"]+' || true)
VPRIV=$(echo "$VAPID_JSON" | grep -oP '"privateKey":"\K[^"]+' || true)

if [ -n "$VPUB" ]; then
  sed -i "s|VAPID_PUBLIC_KEY=|VAPID_PUBLIC_KEY=${VPUB}|"   .env
  sed -i "s|VAPID_PRIVATE_KEY=|VAPID_PRIVATE_KEY=${VPRIV}|" .env
  docker compose restart backend >/dev/null
  echo -e " ${GREEN}✓${NC}"
else
  echo -e " ${YELLOW}⚠ Übersprungen (web-push nicht verfügbar)${NC}"
fi

# ── Erster Admin-Benutzer ─────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}── Erster Admin-Benutzer ───────────────────────────────────${NC}"
read -rp "  Benutzername [admin]: " ADMIN_USER;  ADMIN_USER=${ADMIN_USER:-admin}
read -rp "  Anzeigename [Administrator]: " ADMIN_NAME; ADMIN_NAME=${ADMIN_NAME:-Administrator}
read -rsp "  Passwort: " ADMIN_PASS; echo ""

docker exec gasdispo-backend node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://mongodb:27017/gasdispo').then(async () => {
  const bcrypt = require('bcryptjs');
  const User   = require('./src/models/User');
  const exists = await User.findOne({ username: '${ADMIN_USER}' });
  if (exists) { console.log('  Benutzer existiert bereits.'); process.exit(0); }
  await User.create({
    name: '${ADMIN_NAME}',
    username: '${ADMIN_USER}',
    password: await bcrypt.hash('${ADMIN_PASS}', 12),
    role: 'administrator',
    isActive: true
  });
  console.log('  Admin-Benutzer erstellt.');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✓ Installation abgeschlossen!${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Frontend:${NC}  http://${SERVER_HOST}:${FRONTEND_PORT}"
echo -e "  ${BOLD}API:${NC}       http://${SERVER_HOST}:5000"
echo ""
echo -e "  ${BOLD}Login:${NC}     ${ADMIN_USER}"
echo ""
echo -e "  ${CYAN}Logs:${NC}      docker compose logs -f"
echo -e "  ${CYAN}Stoppen:${NC}   docker compose down"
echo -e "  ${CYAN}Update:${NC}    git pull && docker compose up -d --build"
echo ""
