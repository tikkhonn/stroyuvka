#!/usr/bin/env bash
# Shared helpers for backup / restore / deploy. Source from repo root scripts.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose}"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-asmrlsp}"
POSTGRES_DB="${POSTGRES_DB:-asmrlsp}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/api/health}"

require_compose() {
  if ! $COMPOSE ps >/dev/null 2>&1; then
    echo "Ошибка: Docker Compose недоступен или проект не запущен из $ROOT_DIR" >&2
    exit 1
  fi
}

postgres_container() {
  local id
  id="$($COMPOSE ps -q "$POSTGRES_SERVICE" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    echo "Ошибка: контейнер сервиса '$POSTGRES_SERVICE' не найден. Запустите: $COMPOSE up -d $POSTGRES_SERVICE" >&2
    exit 1
  fi
  echo "$id"
}

ensure_backup_dir() {
  mkdir -p "$BACKUP_DIR"
}
