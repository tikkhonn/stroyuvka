#!/usr/bin/env bash
# Restore PostgreSQL from a .sql or .sql.gz dump created by backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

if [[ $# -lt 1 ]]; then
  echo "Использование: $0 <path-to-dump.sql[.gz]>" >&2
  echo "Пример: $0 backups/asmrlsp-20260902-030000.sql.gz" >&2
  exit 1
fi

DUMP="$1"
if [[ ! -f "$DUMP" ]]; then
  # allow relative to repo root
  if [[ -f "$ROOT_DIR/$DUMP" ]]; then
    DUMP="$ROOT_DIR/$DUMP"
  else
    echo "Ошибка: файл не найден: $1" >&2
    exit 1
  fi
fi

require_compose
CONTAINER="$(postgres_container)"

echo "ВНИМАНИЕ: восстановление перезапишет текущую БД '$POSTGRES_DB'."
echo "Дамп: $DUMP"
if [[ -z "${ASSUME_YES:-}" ]]; then
  read -r -p "Продолжить? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Отменено."; exit 1 ;;
  esac
fi

echo "Останавливаю backend (чтобы не писали в БД)..."
$COMPOSE stop backend || true

echo "Восстанавливаю..."
if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
else
  docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <"$DUMP"
fi

echo "Поднимаю сервисы..."
$COMPOSE up -d

echo "Готово. Проверьте: $HEALTH_URL"
