#!/bin/bash
set -e
echo "── Orderdesk Update ─────────────────────────────────────────"
git pull
# Versionsinfo ins Backend-Image einbrennen (Anzeige unter Mein Konto)
export GIT_COMMIT=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose up -d --build
echo "✓ Update abgeschlossen ($(git rev-parse --short HEAD))"
docker compose ps
