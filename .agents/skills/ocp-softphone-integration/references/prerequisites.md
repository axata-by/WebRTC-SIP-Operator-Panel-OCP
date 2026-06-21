# Prerequisites

Проверь и собери до начала внедрения.

## От пользователя (внешнее)

Спроси через `ask_questions` (type: text), если нет в чате:

| Параметр | Пример | Куда пойдёт |
|---|---|---|
| `ocp_domain` | `mmmm.service-desk.site` | `softphone_settings.ocp_domain` |
| `ocp_proxy_url` | `https://proxy.example.com` (без trailing `/`) | `softphone_settings.ocp_proxy_url` |
| `ocp_proxy_api_key` | секрет (Bearer-like) | `softphone_settings.ocp_proxy_api_key` (хранится в БД, не как Supabase secret) |
| `telephony_login` для текущего пользователя | `operator123` | `profiles.telephony_login` |

> `ocp_proxy_api_key` хранится в БД, а не в Supabase secrets — потому что меняется per-installation и редактируется через UI настроек. Доступ к таблице ограничен RLS admin-only.

## В целевом проекте

- [ ] Cloud (managed Supabase) включён, **или** настроен Self-Hosted Supabase
- [ ] Есть таблица `profiles` с колонкой `user_id uuid` (если нет — skill `database-schema.md` создаст её или добавит колонку)
- [ ] Есть RLS-функция `public.has_role(_user_id uuid, _role app_role)` (нужна для admin-only RLS на `softphone_settings`). Если нет — указать пользователю создать через стандартный паттерн user-roles
- [ ] React 18 + Vite + TypeScript (стандартный стек проекта)
- [ ] Для **Phase 2**: таблица `calls` уже существует с минимальным набором колонок: `external_call_id`, `status_code`, `call_type`, `line_number`, `operator_ext`, `caller_phone`, `called_phone`, `queue`, `started_at`, `screen_pop_opened_at`, `answered_at`, `finished_at`, `screen_pop_closed_at`, `duration`. Если нет — это **отдельный проект**, не входит в скоуп этого skill

## Версия бандла виджета (зафиксирована)

Бандл (JS + CSS) лежит в `public/softphone/` корня этого kit-репозитория — копируется напрямую в `public/softphone/` целевого проекта (см. `assets/widget-bundle-info.md`). Текущая версия — в `CHANGELOG.md` корня kit.

При апдейте версии (новый beta/RC) — поменять имена файлов и теги в `index.html` синхронно.

## Memory references

Тонкие места, на которые стоит обратить внимание (выжимка из внутренних memory эталонного проекта):

- **Safe injection виджета вне React.** Виджет монтируется в `<div id="soft-phone-container">` вне React-дерева, чтобы реконсилятор не пересоздавал его при роутинге. См. `useSoftphonePosition` (`assets/reference-code/src/hooks/useSoftphonePosition.ts`).
- **dom-patch — защита от `removeChild` crash.** React 18 при анмаунте может попытаться удалить узел, который виджет уже переместил в `<body>`. Патч `src/lib/dom-patch.ts` оборачивает `Node.prototype.removeChild`/`insertBefore` и глотает `NotFoundError`. Должен импортироваться **первой строкой** `main.tsx`, до `import React`. (issue facebook/react#11538)
- **Параллельные интеграции PBX vs Softphone.** Если в проекте параллельно живёт PBX-вебхук (`telephony-call-*`), приоритет: softphone-event (live из виджета) перекрывает данные PBX по тому же `external_call_id`.
- **Status code hierarchy** (для `softphone-call-finish`): `sipcode` (если передан) → `answered` param (true→200, false→304) → факт `answered_at` в БД. См. `assets/reference-code/src/lib/softphone/callFinishService.ts`.
- **ACW переходы.** `acw_auto_ready_mode`: `off` (вручную), `on_card_close` (Ready при закрытии карточки), `on_call_end` (Ready при finished_at), `always` (Ready всегда). См. `assets/reference-code/src/lib/softphone/acwAutoReady.ts`.
- **External events API.** `softphone-event` GET-эндпоинт без JWT — точка входа для внешних PBX/телефонии. Контракт в `references/edge-functions.md`.
- **Reliability retry.** `softphone-call-answer` делает 3 ретрая по 2с — race condition с `call-register` (звонок может прилететь в виджет раньше, чем PBX-вебхук успеет создать строку в `calls`). См. `assets/reference-code/src/lib/softphone/retry.ts`.
- **Z-index hierarchy.** Контейнер виджета — `9999`, портал-попапы виджета в `<body>` — `99999`. Зашиты в `useSoftphonePosition` через `MutationObserver`.
