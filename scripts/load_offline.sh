#!/usr/bin/env bash
# Load a prebuilt image archive and start Compose without contacting a registry.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

TAR="${1:-$ROOT_DIR/puls-images.tar}"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Ошибка: нет $ROOT_DIR/.env. Скопируйте .env.example и задайте SECRET_KEY, CORS_ORIGINS, SEED_DEMO_DATA=false." >&2
  exit 1
fi

if [[ ! -f "$TAR" ]]; then
  echo "Ошибка: нет файла образов $TAR" >&2
  exit 1
fi

echo "=== Загрузка образов из $TAR ==="
docker load -i "$TAR"

echo "=== Запуск без сборки ==="
$COMPOSE up -d

echo "=== Ожидание health ($HEALTH_URL) ==="
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
  echo "Не запускайте docker compose up --build: на сервере без интернета сборка не пройдёт." >&2
  exit 1
fi

echo "=== Сервер запущен ==="
echo "Интерфейс: порт 5173. Nginx (порт 8080): $COMPOSE --profile prod up -d"
echo "Обновление: новый tar, снова ./scripts/load_offline.sh. Перед этим ./scripts/backup.sh."
