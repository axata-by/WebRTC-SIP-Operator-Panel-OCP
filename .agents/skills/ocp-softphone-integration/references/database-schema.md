# Database Schema

Готовая консолидированная миграция (Phase 1 + Phase 2): **`assets/migrations/001_softphone_schema.sql`**. Применяется через `supabase--migration` (или эквивалентный механизм миграций целевого проекта). Идемпотентна — безопасна на пустой базе и на базе с уже существующими частями.

Для Self-Hosted после применения — выполнить SIGUSR1 PostgREST, иначе новая RPC `get_softphone_settings` не видна (см. `cloud-vs-self-hosted.md`).

Ниже — описание схемы для понимания. **Не дублируй SQL вручную** — копируй `assets/migrations/001_softphone_schema.sql` целиком.

## Phase 1: `softphone_settings` + `profiles.telephony_login`

**Singleton** `public.softphone_settings` (уникальный индекс на `((true))` — ровно одна строка):

- Настройки прокси: `ocp_domain`, `ocp_proxy_url`, `ocp_proxy_api_key`
- Поведение: `auto_connect`, `acw_auto_ready`, `acw_auto_ready_mode` (off/on_card_close/on_call_end/always), `click_to_call_mode` (browser/softphone)
- Позиционирование: `position_anchor`, `top_offset`, `right_offset`, `fixed_to_header`
- События открытия/закрытия карточки: `open_card_events[]`, `close_card_events[]` — валидные значения см. `strategies.md`
- RLS: admin-only через `has_role(auth.uid(), 'admin')`; SELECT доступен любому authenticated (но `ocp_proxy_api_key` маскируется в RPC `get_softphone_settings`)

**RPC `get_softphone_settings()`** — `SECURITY DEFINER`, скрывает `ocp_proxy_api_key` от не-админов. Единая точка чтения для виджета.

**`public.profiles.telephony_login TEXT`** — логин оператора в OCP, читается `useSoftphoneAutoConnect`.

> ⚠️ Если в проекте **нет** функции `has_role(uuid, app_role)` — сначала развернуть стандартный паттерн user-roles (см. инструкцию проекта `user-roles` в основном промпте). Без неё политика выше не сработает.

> ⚠️ Если в проекте **нет** таблицы `profiles` — это отдельная задача, выходит за рамки skill; попроси пользователя сначала развернуть профили.

## Phase 2: `call_screen_pop_configs`

Полная схема секций/табов лежит в `assets/migrations/001_softphone_schema.sql` (раздел Phase 2). Конфиг включает:
- Условия матчинга: `call_directions` (см. enum ниже), `is_active`, `is_default`
- Что показывать: `show_contact`, `show_company`, `show_deals`, `show_call_history`, `show_sms`, `show_call_result`
- Какие поля каждой секции: `contact_fields`, `company_fields`, `deal_fields`, `user_fields` (JSONB массивы field codes)
- Порядок и колоночность: `sections_order TEXT[]`, `section_columns JSONB`
- Кастом: `custom_elements JSONB` (iframe/кнопки/JS-блоки)
- UI: `position`, `width`, `height`, `is_resizable`, `is_minimizable`
- Результат звонка: `call_result_tree_id`, `call_result_required`, `call_result_multiple`

`public.user_screen_pop_settings` — пер-пользовательские overrides `position/width/height/is_minimized` для конкретного `config_id`.

**`call_directions` enum** (соответствует `public.calls.call_type`):
- `1` = исходящий
- `2` = входящий
- `3` = входящий с переадресацией
- `4` = обратный звонок

**Правила матчинга** (реализованы в `assets/reference-code/src/lib/softphone/configLoader.ts`):
1. Активные записи (`is_active = true`), у которых `call_directions` содержит `call_type` входящего звонка — кандидаты.
2. Если кандидатов несколько — приоритет согласно `configLoader.ts` (читай файл — это источник истины).
3. Если кандидатов нет — берётся запись с `is_default = true`.
4. Если и default нет — карточка не открывается, в консоли warning.


## Self-Hosted: после миграции

```bash
# Перезагрузить PostgREST cache, иначе новая RPC `get_softphone_settings` не видна
docker exec supabase-rest pkill -SIGUSR1 postgrest || true
```

Если контейнер называется иначе (`rest`, `supabase_rest_<env>` и т.п.) — найти через `docker ps | grep -i postgrest` и подставить имя. Альтернатива: `docker exec <container> pkill -HUP postgrest` тоже триггерит перечитывание схемы.
