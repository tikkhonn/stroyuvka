# pgAdmin в Docker

## Запуск

Основной стек **без** pgAdmin (чтобы `docker compose up` не падал, если образ не скачан):

```bash
docker compose up -d
```

pgAdmin (профиль `tools`):

```bash
./scripts/pull-pgadmin.sh
docker compose --profile tools up -d pgadmin
```

UI: http://localhost:5050 — `admin@local.dev` / `asmrlsp_dev` (или из `.env`).

ERD: правый клик по БД `asmrlsp` → **Generate ERD**.

## Ошибка `EOF` / `failed to copy` при pull

Типично обрыв связи с Docker Hub или нестабильное **registry-mirror** в настройках Docker.

1. **Docker Desktop → Settings → Docker Engine** — временно уберите `registry-mirrors`, Apply & Restart.
2. **Settings → General** — отключите **Docker Scout** (анализ образов иногда ломает pull).
3. Скачайте образ отдельно с повторами: `./scripts/pull-pgadmin.sh`
4. Или вручную: `docker pull dpage/pgadmin4:8.14.0`
5. При нестабильном интернете: VPN другого региона или другая сеть; в Engine можно снизить `"max-concurrent-downloads": 1`.
6. `docker login` — лимиты Hub для анонимов ниже.

После успешного pull:

```bash
docker compose --profile tools up -d pgadmin
```

## Пароль Postgres

Файл [pgpass](pgpass) должен совпадать с `POSTGRES_PASSWORD` в `.env` (строка `postgres:5432:*:user:password`).
