#!/usr/bin/env bash
# Safe deploy: backup DB, record git commit, rebuild compose, wait for health.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_compose
ensure_backup_dir

echo "=== 1/4 Бэкап БД ==="
"$SCRIPT_DIR/backup.sh"
LATEST_BACKUP="$(ls -t "$BACKUP_DIR"/asmrlsp-*.sql.gz 2>/dev/null | head -n1 || true)"

COMMIT="unknown"
if git -C "$ROOT_DIR" rev-parse HEAD >/dev/null 2>&1; then
  COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
else
  BRANCH="?"
fi

LOG="$BACKUP_DIR/last-deploy.txt"
{
  echo "timestamp=$(date -Iseconds)"
  echo "commit=$COMMIT"
  echo "branch=$BRANCH"
  echo "backup=${LATEST_BACKUP:-}"
} >"$LOG"
echo "=== Зафиксирован деплой → $LOG ==="
cat "$LOG"

echo "=== 2/4 Сборка и запуск ==="
$COMPOSE up -d --build

echo "=== 3/4 Ожидание health ($HEALTH_URL) ==="
ATTEMPTS="${HEALTH_ATTEMPTS:-60}"
ok=0
for i in $(seq 1 "$ATTEMPTS"); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    echo "Health OK (попытка $i)"
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "Ошибка: /api/health не ответил за $((ATTEMPTS * 2)) с." >&2
  echo "См. откат: docs/rollback.md" >&2
  echo "Коммит до/на момент деплоя: $COMMIT" >&2
  echo "Бэкап: ${LATEST_BACKUP:-нет}" >&2
  exit 1
fi

echo "=== 4/4 Деплой завершён ==="
echo "Если что-то не так — docs/rollback.md"
echo "Бэкап перед обновлением: ${LATEST_BACKUP:-}"
