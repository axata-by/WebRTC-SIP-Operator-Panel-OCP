# Troubleshooting

> 💡 **Перед глубокой диагностикой** — включи verbose SIP-лог:
> `localStorage.setItem('debug','true'); location.reload();`
> Полный список диагностических `localStorage`-флагов (`debug`, `force_sendonly`, сброс «прилипшей» регистрации через очистку `JSSIP_CONFIGS`/`lastUAInstance` и т.д.) — в `references/client-storage.md`.



## React падает с `NotFoundError: Failed to execute 'removeChild' on 'Node'`

**Причина**: `src/lib/dom-patch.ts` не импортирован первой строкой `main.tsx`, либо вообще отсутствует.

**Фикс**: убедиться, что **первая строка** `main.tsx` — `import './lib/dom-patch';`. Никаких других импортов до него.

См. `architecture/dom-reconciliation-protection-patch`.

## Виджет не виден на странице

Проверь по очереди:
1. В DevTools есть ли `#soft-phone-container`? Если нет — `<div>` не добавлен в `index.html`.
2. `document.getElementById('soft-phone-container').style.display` — должен быть `block` (auto-connect делает это). Если `none` — `useSoftphoneAutoConnect` не отработал.
3. z-index: `getComputedStyle(...).zIndex` должен быть `9999`. Если меньше — конфликт с твоим layout'ом (skill использует `!important`).
4. Бандл загрузился? В Network ищи `softphone-1.0.0-beta-10.js` со статусом 200. Если 404 — файл не лежит в `public/softphone/`.

## Попап набора номера/звонка обрезается или поверх него рендерится что-то

z-index порталов виджета должен быть `99999`. `useSoftphonePosition` ставит его через MutationObserver на `<body>`. Если не работает:
- Проверь, что хук вообще смонтирован (`SoftphoneIntegration` компонент включён в layout)
- Проверь CSS-селекторы: observer ищет id/class содержащие `soft-phone`, `softphone`, `ocp-phone`. Если виджет новой версии использует другие имена — обнови матчинг

## `softphone-authenticate` возвращает 401/403

- `ocp_proxy_url` имеет trailing slash → убрать (`https://proxy.example.com`, не `.../`)
- `ocp_proxy_api_key` пустой/невалидный → пере-ввести в настройках
- Прокси-сервер требует другой заголовок → проверить с владельцем OCP-инфраструктуры

## `softphone-authenticate` возвращает 500 «Softphone settings not found»

Singleton-строка в `softphone_settings` отсутствует. Проверь:
```sql
SELECT COUNT(*) FROM public.softphone_settings;
```
Должно быть `1`. Если `0` — выполни seed из `database-schema.md`.

## Self-Hosted: RPC `get_softphone_settings` не найдена / 404

PostgREST не перечитал schema cache. Выполни SIGUSR1:
```bash
docker exec supabase-rest pkill -SIGUSR1 postgrest
```
См. `references/cloud-vs-self-hosted.md`, раздел «Self-Hosted: перечитывание схемы PostgREST».

## Self-Hosted: edge-функция возвращает 404 от Kong

Функция не зарегистрирована в `FUNCTION_MODULES` в `supabase/functions/main/index.ts`. См. `edge-functions.md`.

## Phase 2: звонок не создаёт запись в `calls`

1. В консоли есть `[Softphone] event ...`? Если нет — `bridgeWindowEvents` не вызван (проверь, что `useSoftphoneCallHandler` смонтирован, он внутри вызывает `useSoftphoneEvents`).
2. Имя события виджета входит в `softphone_settings.open_card_events`? По умолчанию: `incomingCallProgress`, `outgoingCallProgress`, `OCPincomingCallProgress`. Если виджет шлёт что-то другое — добавь в массив через UI настроек.
3. `loadConfigForCall` нашёл конфиг? Если нет — создай дефолтный в `call_screen_pop_configs` (`is_default=true`, `is_active=true`, `call_directions=ARRAY[1,2]`).

## Phase 2: создаётся 2 записи в `calls` на один звонок

Race condition между `OCPincomingCallProgress` (от виджета) и сторонним источником (PBX). Проверь:
- `normalizeCallId` работает (срезает префикс `rB2-`)
- В `createCallRecord` для `OCPincomingCallProgress` выставлен `forceCallType: true`
- В retry-логике (`softphone-call-answer`) 3 попытки с задержкой 2с

См. memory `architecture/parallel-call-integration-mechanisms` и `architecture/softphone-reliability-retry-logic`.

## Phase 3: `window.Softphone.callNumber` is not a function

Виджет ещё не инициализирован полностью (асинхронная подгрузка SIP-стэка). `useClickToCall` уже имеет fallback на `tel:` — проверь его. Если fallback не срабатывает — пользователь видит ошибку в консоли; обнови условие проверки `typeof window.Softphone?.callNumber === 'function'`.

## ACW не переключает в Ready

- `acw_auto_ready_mode` точно не `off`?
- `window.Softphone?.ocpModule?.changeStatusToReady` существует? Залогируй в консоли.
- Для `on_card_close` — карточка действительно закрылась через `closeTab()`? Хук вызывает `notifySoftphoneCardClosed()` именно там.
- Для `on_call_end` — событие `incomingCallEnded`/`outgoingCallEnded` дошло до bridge? Проверь в `eventBus.ts` debug-логах.
