---
name: ocp-softphone-integration
description: Embed the OCP browser softphone widget (auth, click-to-call, screen pop, ACW) into any project — Cloud (managed Supabase) or Self-Hosted Supabase. Trigger when the user asks to add/embed OCP softphone, integrate the browser softphone widget, add click-to-call powered by OCP, port the OCP CRM telephony stack to another project, or wire a PBX browser widget with screen pop.
---

# OCP Softphone — Embed Skill

Self-contained skill: эталонный код виджета (хуки, библиотека, edge-функция, консолидированная миграция) лежит **внутри самого skill** в `assets/reference-code/` и `assets/migrations/`. Skill работает одинаково в Cursor, Claude Code, Windsurf и любой другой IDE с агентным режимом — без зависимостей от внешних проектов.

> **Источник истины** — папка `assets/` этого skill. Все ссылки на конкретные файлы в references указывают на пути внутри `assets/reference-code/...`. Копировать в целевой проект по тем же относительным путям (`src/lib/softphone/...`, `src/hooks/useSoftphone*.ts` и т.д.).
>
> Если у агента есть доступ к отдельному эталонному репозиторию в той же организации — можно сверять файлы с ним для верификации. Базовый сценарий — копирование из локальных `assets/`.

---

## Когда применять

Триггеры в запросе пользователя: «добавь софтфон», «встрой OCP», «click-to-call через OCP», «браузерный софтфон с screen pop», «перенеси телефонию из OCP CRM», «PBX widget с авто-Ready», а также продуктовые фичи виджета: «blind/attended transfer», «параллельные вызовы», «DND / Не беспокоить», «авто-ответ», «auto-Ready / ACW», «темы оформления софтфона», «debug SIP в браузере», «нормализация номера», «карточка входящего вызова», «журнал звонков виджета», «window.Softphone API», «подписка на события софтфона / `campaignEvents` / `ocpNotification`».

**НЕ применять** для PBX-вебхуков (`telephony-call-*`, S2S `X-API-Token`) — это отдельная подсистема, не часть OCP-виджета.

---

## Обязательный пре-шаг: уточнить scope

Перед любым кодом вызвать `questions--ask_questions` (type: choice) с тремя вопросами:

1. **Фаза внедрения**:
   - Phase 1 — только виджет + аутентификация + страница настроек
   - Phase 2 — + регистрация звонков + screen pop
   - Phase 3 — + ACW авто-Ready + click-to-call
2. **Backend**: Cloud (managed Supabase) / Self-Hosted Supabase
3. **Есть ли в проекте таблица `calls`?** (нужно для Phase 2+; если нет — Phase 2 не разворачивать без отдельной модели)

Если backend = Self-Hosted, **обязательно** также прочитать skill `self-hosted-edge-compatibility` и `references/cloud-vs-self-hosted.md`.

---

## Дерево решений

```
Что виджет умеет (фичи, API, события — обзор) → references/capabilities.md
                                                  (+ assets/webrtc-softphone-v12.pdf)

Точные сигнатуры window.Softphone, имена событий
и поля event.detail (campaignEvents, ocpNotification,
OCP*, authenticateOCPModule)               → references/events-api.md
                                              (+ assets/webrtc-softphone-events-api-v12.pdf)


Все фазы (выбор scope) → references/phased-adoption.md

Любая фаза:
  prerequisites             → references/prerequisites.md
  файлы для копирования     → references/files-manifest.md
  схема БД                  → references/database-schema.md
  edge-функции              → references/edge-functions.md
  wiring HTML/main/Layout   → references/integration-steps.md
  Cloud vs SHE              → references/cloud-vs-self-hosted.md
  траблшутинг               → references/troubleshooting.md
  localStorage виджета,
  logout cleanup, debug-флаги → references/client-storage.md
  бандл виджета             → assets/widget-bundle-info.md

Phase 2+ (screen pop):
  как вызывается карточка → references/screen-pop-pipeline.md
  стратегии настройки     → references/strategies.md
```

---

## Инварианты, которые НЕЛЬЗЯ нарушать

1. **`import './lib/dom-patch'` — ПЕРВОЙ строкой `src/main.tsx`**, до `import React`. Иначе React падает `NotFoundError` при навигации (issue #11538).
2. **Бандл виджета лежит в `public/softphone/`**, статически подключён в `index.html`. Не пытаться импортировать как ES-module.
3. **Z-index**: `#soft-phone-container` и `#soft-phone-wrapper` = `9999`; портал-узлы в `<body>` (попапы виджета) = `99999`. Зашиты в `useSoftphonePosition` через MutationObserver.
4. **`softphone-authenticate` не вызывает OCP напрямую** — только через прокси `${ocp_proxy_url}/proxy/authenticate?login=...` с заголовком `Ocp-Proxy-Api-Key`. URL и ключ — из таблицы `softphone_settings`.
5. **`softphone_settings` — singleton** (одна строка), читается через RPC `get_softphone_settings` (SECURITY DEFINER), пишется прямым UPDATE с RLS admin-only.
6. **Profiles**: пользователь должен иметь `profiles.telephony_login` — это логин в OCP. Без него auto-connect не работает.
7. **Self-Hosted после миграции с RPC** — обязательно SIGUSR1 к PostgREST, иначе RPC «не находится» (см. `references/cloud-vs-self-hosted.md`, раздел «Self-Hosted: перечитывание схемы PostgREST»).

---

## Послеполётный чек

После внедрения проверить:
- [ ] `index.html` содержит `<div id="soft-phone-container">` + `<script type="module">` на JS-бандл + `<link>` на CSS
- [ ] `src/main.tsx` начинается с `import './lib/dom-patch';`
- [ ] AppLayout рендерит компонент с тремя хуками (`useSoftphonePosition`, `useSoftphoneAutoConnect`, опц. `useSoftphoneCallHandler`)
- [ ] Edge `softphone-authenticate` отвечает 200 при наличии валидного `login`
- [ ] Страница `/settings` → «Настройки софтфона» открывается, поля редактируются, UPDATE отрабатывает
- [ ] Self-Hosted: новые edge-функции добавлены в `FUNCTION_MODULES` (см. `self-hosted-edge-compatibility`); RPC доступна после SIGUSR1
- [ ] В `useAuth.signOut` контейнеры виджета скрываются (`display:none`) **и** очищаются `localStorage`-ключи виджета `JSSIP_CONFIGS`, `JSSIP_CALL_HISTORY`, `lastUAInstance` (см. `references/client-storage.md`)

**Phase 2 (screen pop) дополнительно:**
- [ ] В `call_screen_pop_configs` есть хотя бы одна запись с `is_default = true` — иначе карточка не откроется ни для одного звонка
- [ ] `softphone_settings.open_card_events` содержит ID **только** из валидного множества (см. `references/strategies.md`): `incomingCallProgress`, `outgoingCallProgress`, `OCPincomingCallProgress`, `campaignEvents`, `incomingCallAccepted`, `outgoingCallAccepted`
- [ ] `softphone_settings.close_card_events` — подмножество `{incomingCallEnded, outgoingCallEnded}`
- [ ] `<ActiveCallProvider>` оборачивает `<Routes>` (иначе `openCard` упадёт с «no provider»)
- [ ] `<CallScreenPop />` отрендерен внутри `<ActiveCallProvider>` ровно один раз

При апдейте версии бандла виджета — поднять номер в `index.html` (`softphone-X.Y.Z-...js/.css`) и переписать файлы в `public/softphone/`.
