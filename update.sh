#!/bin/bash
set -e
echo "── Orderdesk Update ─────────────────────────────────────────"
git pull
docker compose up -d --build
echo "✓ Update abgeschlossen"
docker compose ps
