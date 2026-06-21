# Cloud (managed Supabase) vs Self-Hosted Supabase

Виджет, авторизация и логика — **идентичны** в обоих режимах. Отличия только в деплое и нескольких операционных шагах.

## Сводка отличий

| Шаг | Cloud (managed) | Self-Hosted |
|---|---|---|
| Миграции | `supabase--migration` → авто-применение | `supabase--migration` → запускается, но в self-hosted поднимается тем же путём + `pg_reload_conf()` |
| Edge-функции деплой | Автоматический после `code--write` файла | Нужна сборка/ansible (см. `EDGE_FUNCTIONS_SUMMARY.md` в `supabase-selfhosted/ansible/`) |
| Регистрация edge-функций | Не нужна | **Обязательно** добавить в `FUNCTION_MODULES` в `supabase/functions/main/index.ts` |
| RPC видна сразу | Да | Нужен **SIGUSR1** PostgREST (см. раздел ниже) |
| `verify_jwt = false` | Через `supabase/config.toml` | Через `config.toml` + проверка Kong routes |
| Realtime для `softphone_settings` | Работает | Если используется — добавить в `supabase_realtime` publication и проверить REPLICA IDENTITY (skill `self-hosted-edge-compatibility/references/realtime.md`) |
| URL Storage (если виджет грузится из Storage) | Не актуально, бандл лежит в `public/` | Не актуально, бандл лежит в `public/` |

## Cloud (managed Supabase) — порядок действий

1. `code--write` всех файлов из `files-manifest.md`
2. `supabase--migration` с DDL из `database-schema.md` — пользователь подтверждает
3. Готово — edge-функции автодеплоятся

## Self-Hosted — порядок действий

1. `code--write` всех файлов из `files-manifest.md`
2. **Добавить новые функции в `FUNCTION_MODULES`** (см. `edge-functions.md` раздел Self-Hosted)
3. `supabase--migration` с DDL
4. После применения миграции — выполнить SIGUSR1 на PostgREST контейнере:
   ```bash
   docker exec supabase-rest pkill -SIGUSR1 postgrest
   ```
5. Применить skill `self-hosted-edge-compatibility` целиком — проверить весь чек-лист (CORS, shape, верификация JWT, SSRF и т.д.)
6. Передеплоить edge-функции стандартной процедурой self-hosted (Ansible или эквивалент)

## Self-Hosted: перечитывание схемы PostgREST после миграции

После любой миграции, которая создаёт/удаляет SQL-функцию (включая `get_softphone_settings`), PostgREST на self-hosted держит старую схему в кэше до перезагрузки. Без неё новая RPC отдаёт `404 - Could not find the function ... in the schema cache`.

Триггер перезагрузки — POSIX-сигнал процессу `postgrest`:

```bash
# Стандартное имя контейнера в Supabase self-hosted
docker exec supabase-rest pkill -SIGUSR1 postgrest

# Если контейнер называется иначе — найти:
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgrest
# и подставить имя:
docker exec <container-name> pkill -SIGUSR1 postgrest
```

Альтернативы:
- `pkill -HUP postgrest` (тот же эффект — PostgREST трактует HUP как «перечитать конфиг + схему»).
- `NOTIFY pgrst, 'reload schema';` через `psql` в БД — PostgREST подписан на этот канал, если включён `db-channel-enabled`.
- Перезапуск контейнера (`docker restart supabase-rest`) — overkill, но работает.

Документировать этот шаг в release notes self-hosted деплоя. Cloud (managed Supabase) выполняет это автоматически.

## Общие точки отказа

- **`ocp_proxy_url` доступен из edge-runtime?** Прокси может быть в приватной сети. На Cloud — должен быть публичным HTTPS. На Self-Hosted — может быть приватным, но тогда edge-runtime контейнер должен иметь сетевой доступ.
- **CORS на прокси-сервере OCP.** `softphone-authenticate` ходит server-to-server, CORS не нужен. Но если в будущем понадобятся прямые запросы из браузера к прокси — открыть CORS на прокси.
- **Бандл виджета и Vite base path.** Если проект задеплоен под non-root path (`/app/`), скорректировать `<script src>` в `index.html`.
