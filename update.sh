#!/bin/bash
set -e
echo "── Orderdesk Update ─────────────────────────────────────────"
git pull
# Für "Version aktualisieren" in Mein Konto: Token für den Updater-Container anlegen, falls noch nicht vorhanden
if [ -f .env ] && ! grep -q '^UPDATER_TOKEN=.' .env; then
  printf '\n# Updater-Container (Version aktualisieren in der App)\nUPDATER_TOKEN=%s\n' "$(openssl rand -hex 24)" >> .env
  echo "✓ UPDATER_TOKEN in .env angelegt"
fi
# Versionsinfo ins Backend-Image einbrennen (Anzeige unter Mein Konto)
export GIT_COMMIT=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose up -d --build
echo "✓ Update abgeschlossen ($(git rev-parse --short HEAD))"
docker compose ps
