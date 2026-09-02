# Откат после неудачного обновления

Цель: вернуть рабочий код и при необходимости данные БД.

## Что сохраняется при деплое

Скрипт `./scripts/deploy.sh` перед обновлением:

1. делает бэкап в `backups/asmrlsp-*.sql.gz`;
2. пишет `backups/last-deploy.txt` с полями `commit`, `branch`, `backup`, `timestamp`.

## Быстрый откат (только код)

Если новый код сломался, а схема БД **не** менялась (нет новых миграций / патчей схемы):

```bash
# посмотреть зафиксированный коммит
cat backups/last-deploy.txt

# вернуть код (подставьте commit=... из last-deploy.txt)
git checkout <commit>

docker compose up -d --build
curl -sf http://localhost:8000/api/health
```

Затем вернитесь на рабочую ветку (`git switch main` и т.п.) и разберитесь с проблемой.

## Откат кода + базы (после миграции или порчи данных)

Если обновление уже успело изменить схему или данные — **откатывайте код вместе с restore**:

```bash
cat backups/last-deploy.txt
# backup=... — дамп, сделанный непосредственно перед этим деплоем

git checkout <commit>
docker compose up -d postgres
./scripts/restore.sh backups/asmrlsp-YYYYMMDD-HHMMSS.sql.gz
curl -sf http://localhost:8000/api/health
```

`restore.sh` остановит backend на время восстановления и затем поднимет сервисы снова.

## Правило про миграции

Пока схема местами чинится при старте (`ensure_*_schema`) и через Alembic:

- **перед любым обновлением** — бэкап (делает `deploy.sh`);
- если миграция/патч схемы уже применились — откат **только git checkout недостаточен**: нужен ещё `restore.sh` из дампа до деплоя.

## Если health после деплоя не поднялся

1. `docker compose logs backend --tail 100`
2. Не крутите `docker compose down -v` — это удалит том `pgdata` без восстановления.
3. Откатитесь по шагам выше.

## Копия бэкапов наружу

Файлы в `backups/` лежат на том же диске, что и сервер. Раз в неделю скопируйте каталог на другой носитель (флешка, другой ПК):

```bash
# пример
cp -a backups "/path/to/external/asmrlsp-backups-$(date +%Y%m%d)"
```
