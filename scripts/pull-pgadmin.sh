#!/usr/bin/env bash
# Скачивание pgAdmin отдельно (образ ~160 MB; при EOF повторите или см. docker/pgadmin/README.md).
set -euo pipefail
IMAGE="${PGADMIN_IMAGE:-dpage/pgadmin4:8.14.0}"
MAX_TRIES="${PGADMIN_PULL_RETRIES:-5}"

echo "Pull: $IMAGE (до $MAX_TRIES попыток)"
for i in $(seq 1 "$MAX_TRIES"); do
  if docker pull "$IMAGE"; then
    echo "OK"
    exit 0
  fi
  echo "Попытка $i/$MAX_TRIES не удалась, пауза 10 с…" >&2
  sleep 10
done
echo "Не удалось скачать образ. Проверьте сеть, отключите registry-mirrors в Docker Desktop, см. docker/pgadmin/README.md" >&2
exit 1
