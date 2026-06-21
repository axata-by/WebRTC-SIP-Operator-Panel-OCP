# Files Manifest

Точный список файлов для копирования в целевой проект. **Источник — `assets/reference-code/` внутри этого skill**. Структура внутри `assets/reference-code/` повторяет структуру целевого проекта, поэтому пути слева и справа совпадают.

## Команда копирования (шаблон)

```bash
# Из корня skill в корень целевого проекта
cp -R .agents/skills/ocp-softphone-integration/assets/reference-code/src/lib/softphone   src/lib/softphone
cp    .agents/skills/ocp-softphone-integration/assets/reference-code/src/lib/dom-patch.ts src/lib/dom-patch.ts
# и т.д.
```

Бандл виджета (`public/softphone/*.js|.css`) поставляется в корне репозитория этого skill (`public/softphone/`), не дублируется в `assets/`.

---

## Phase 1 — Minimum Viable (виджет + auth + settings)

### Бандл виджета (binary)
Лежит в репозитории kit в `public/softphone/` — скопировать всю папку в целевой проект. Текущая версия указана в `CHANGELOG.md` корня kit.

### Frontend
Источник: `assets/reference-code/src/...`. Скопировать в целевой проект по тем же путям:
- `src/lib/dom-patch.ts` — **критично**, импортируется первой строкой `main.tsx`
- `src/hooks/useSoftphoneSettings.ts`
- `src/hooks/useSoftphoneAutoConnect.ts`
- `src/hooks/useSoftphonePosition.ts`
- `src/hooks/softphone/useSoftphoneEvents.ts`, `src/hooks/softphone/index.ts`

Не входит в skill (зависит от UI-кита целевого проекта — собрать руками по `references/integration-steps.md`):
- `src/components/settings/softphone/SoftphoneSettingsPage.tsx`
- `src/components/auth/SoftphoneConnectButton.tsx` *(опц.)*
- `src/types/global.d.ts` — декларация `window.Softphone`

### Edge function
- `assets/reference-code/supabase/functions/softphone-authenticate/index.ts` → копировать в `supabase/functions/softphone-authenticate/index.ts`
- (Self-Hosted) добавить в `supabase/functions/main/index.ts` → `FUNCTION_MODULES` — см. `cloud-vs-self-hosted.md`

### Миграция
- `assets/migrations/001_softphone_schema.sql` — консолидированная схема (Phase 1 + Phase 2). Применить через `supabase--migration` или эквивалент.

### Shared (если ещё не созданы в целевом)
- `supabase/functions/_shared/cors.ts` — `corsHeaders`, `handleCors`, `jsonResponse`, `errorResponse`

---

## Phase 2 — Регистрация звонков + Screen Pop

> Требует существующей таблицы `calls`. Если её нет — STOP.

### Frontend (event bus + handlers) — источник `assets/reference-code/`
- `src/lib/softphone/eventBus.ts`
- `src/lib/softphone/types.ts`
- `src/lib/softphone/index.ts`
- `src/lib/softphone/normalizeCallId.ts`
- `src/lib/softphone/callRecordService.ts`
- `src/lib/softphone/callFinishService.ts`
- `src/lib/softphone/configLoader.ts`
- `src/lib/softphone/campaignDataStore.ts`
- `src/lib/softphone/contactLookup.ts`
- `src/lib/softphone/phoneResolution.ts`
- `src/lib/softphone/retry.ts`
- `src/hooks/useSoftphoneCallHandler.ts`

### Screen Pop компоненты
UI-слой screen pop **не входит** в этот skill (слишком тесно завязан на UI-кит и доменные хуки `useCallsApi`/`useContactsApi`/`useCompaniesApi` целевого проекта). Собирать вручную по контракту:
- Провайдер `<ActiveCallProvider>` оборачивает routes
- Компонент `<CallScreenPop />` подписан на `softphone.events.OCP*` через `useSoftphoneCallHandler` (см. assets/reference-code/src/hooks/useSoftphoneCallHandler.ts)
- Конфиг загружается из `call_screen_pop_configs` по правилам матчинга из `database-schema.md`
- Хук `useScreenPopConfigsApi.ts` — стандартный CRUD на таблице (Supabase select/upsert), реализуется в целевом проекте по паттерну остальных API-хуков

### Edge functions
Контракты описаны в `references/edge-functions.md` (методы, body, ответ, идемпотентность). Реализация — стандартные Edge-функции на базе `_shared/cors.ts` и `supabaseAdmin`-клиента. В skill включён только `softphone-authenticate` как эталон формы (см. `assets/reference-code/supabase/functions/softphone-authenticate/index.ts`); остальные собираются по контракту.

- `supabase/functions/softphone-call-answer/`
- `supabase/functions/softphone-call-finish/`
- `supabase/functions/softphone-event/` *(GET endpoint без JWT для внешних систем)*

### Таблицы БД (миграция)
- Включены в `assets/migrations/001_softphone_schema.sql` (Phase 2 секция). Применяются той же миграцией.

---

## Phase 3 — ACW + Click-to-Call

### Frontend
- `src/lib/softphone/acwAutoReady.ts` — источник `assets/reference-code/`
- `src/hooks/useClickToCall.ts` — собрать вручную, читает `softphone_settings.click_to_call_mode`
- `src/components/ui/PhoneLink.tsx` — собрать вручную (зависит от UI-кита)

Никаких новых edge-функций и таблиц на Phase 3 — только клиентская логика, читающая `softphone_settings.acw_auto_ready_mode` и `click_to_call_mode`.

---

## Что НЕ копировать

- `supabase/functions/telephony-call-*` — это PBX-подсистема, не часть OCP-виджета
- `src/components/settings/integrations/TelephonyIntegration.tsx` — управляет PBX-вебхуками, отдельная фича
- `src/hooks/useCallsApi.ts`, `useCallsRealtime.ts` и т.п. — специфика домена `calls` (CRM-целевая), не часть виджета

---

## Аудит после копирования

```bash
# проверить, что все импорты разрешаются
rg "from ['\"]@/" src/lib/softphone src/hooks/softphone src/hooks/useSoftphone --files-with-matches | xargs -I {} sh -c 'echo "=== {} ==="; cat {}'
```

Типичные битые импорты после копирования:
- `@/integrations/supabase/client` — есть в любом проекте на этом стеке, должен работать
- `@/hooks/useAuth` — должен существовать в целевом проекте; если нет — Phase 1 без `useSoftphoneAutoConnect.profiles.telephony_login` (потребуется адаптация)
- `@/components/calls/screen-pop/...` — не входит в skill; либо собрать руками, либо отложить Phase 2
- иконки lucide-react — должны быть; иначе `bun add lucide-react`
