#!/usr/bin/env bash
# Create a compressed PostgreSQL dump into ./backups/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_compose
ensure_backup_dir

CONTAINER="$(postgres_container)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/asmrlsp-${STAMP}.sql.gz"

echo "Бэкап БД '$POSTGRES_DB' → $OUT"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -c >"$OUT"

if [[ ! -s "$OUT" ]]; then
  echo "Ошибка: файл бэкапа пустой" >&2
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "Готово: $OUT ($SIZE)"

# Rotation: delete dumps older than KEEP_DAYS
if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'asmrlsp-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')"
  if [[ "${DELETED:-0}" -gt 0 ]]; then
    echo "Ротация: удалено старых бэкапов: $DELETED (старше ${KEEP_DAYS} дн.)"
  fi
fi
