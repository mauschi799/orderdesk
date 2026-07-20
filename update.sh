#!/bin/bash
set -e
echo "── GasDispo Update ─────────────────────────────────────────"
git pull
docker compose up -d --build
echo "✓ Update abgeschlossen"
docker compose ps
