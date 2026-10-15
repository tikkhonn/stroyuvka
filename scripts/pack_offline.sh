#!/usr/bin/env bash
# Build images on a machine with internet and save them for an air-gapped server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

OUT="${1:-$ROOT_DIR/puls-images.tar}"
IMAGES=(
  puls-backend:offline
  puls-frontend:offline
  postgres:16-alpine
  nginx:alpine
)

echo "=== Сборка образов приложения ==="
$COMPOSE build backend frontend

echo "=== Загрузка postgres и nginx ==="
$COMPOSE pull postgres
$COMPOSE --profile prod pull nginx

echo "=== Сохранение в $OUT ==="
docker save -o "$OUT" "${IMAGES[@]}"

echo "Готово: $OUT"
echo "На флешку вместе с tar положите каталог проекта без node_modules, .git и .env."
echo "Файл .env подготовьте отдельно: SECRET_KEY, CORS_ORIGINS и SEED_DEMO_DATA=false."
echo "На сервере: ./scripts/load_offline.sh $(basename "$OUT")"
