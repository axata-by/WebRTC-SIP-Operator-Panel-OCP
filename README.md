# OCP Softphone Integration Kit

Дистрибутив для клиентов OCP: готовый **skill** + production-бандл браузерного **WebRTC-софтфона**, которые подключаются к любому веб-приложению клиента. Интеграция выполняется агентом в вашей IDE по одному промпту.

---

## Что внутри репозитория

- `.agents/skills/ocp-softphone-integration/` — skill (`SKILL.md` + 13 reference-файлов + `assets/`). Содержит всю процедуру встраивания: prerequisites, схема БД, edge-функции, wiring `index.html`/`main.tsx`, screen pop, troubleshooting.
- `public/softphone/` — production-бандл виджета: `softphone-1.0.0-beta.js` и `softphone-1.0.0-beta.css`.
- `CHANGELOG.md` — версии бандла и skill.
- `LICENSE` — проприетарная, ООО «Софтомнител».

---

## Для кого

Клиенты, купившие продукт **OCP**, которым нужно встроить браузерный софтфон (WebRTC, JsSIP) в собственное веб-ПО: CRM, helpdesk, личный кабинет оператора, внутренние панели и т.п.

Поддерживается любой фронтенд-стек (React, Vue, Svelte, Angular, vanilla) и любой backend, способный проксировать запросы к OCP API (Node.js, Supabase Edge, Cloudflare Workers, .NET, PHP, Go и т.д.).

---

## Как использовать

Три сценария — выберите подходящий вашей команде.

### A. Через агентскую IDE (рекомендуется)

Совместимо с любой современной IDE, поддерживающей агентный режим работы с файлами:

- **Cursor**, **Claude Code**, **Windsurf**, **Cline**, **Continue**, **GitHub Copilot Agent Mode**, **Zed AI**, **Aider**.

Подходящие модели: **Claude Sonnet 4.5 / Opus 4**, **GPT-5 / Codex**, **Gemini 2.5 Pro**.

Шаги:

1. Склонируйте этот репозиторий.
2. Скопируйте в свой проект:
   - папку `.agents/skills/ocp-softphone-integration/` целиком;
   - содержимое `public/softphone/` в публичную статику вашего приложения.
3. Откройте свой проект в агентской IDE и дайте агенту промпт:

   > Прочитай `.agents/skills/ocp-softphone-integration/SKILL.md` и выполни интеграцию софтфона OCP по фазе 1. Перед началом задай уточняющие вопросы по scope, backend и наличию таблицы `calls`.

4. Агент сам прочитает нужные reference-файлы, задаст уточняющие вопросы (фаза, backend, таблица `calls`) и внесёт правки в код по `references/integration-steps.md`.

### B. Через ChatGPT / Claude.ai вручную

Если в проекте нет агентской IDE:

1. Загрузите файлы skill (`SKILL.md` + нужные `references/*.md`) как контекст в чат.
2. Опишите свой стек и попросите пошаговый план интеграции.
3. Применяйте диффы вручную через свой редактор.

### C. Прямое подключение бандла без агента

Для команд, предпочитающих ручную интеграцию:

1. Скопируйте `public/softphone/softphone-1.0.0-beta.js` и `softphone-1.0.0-beta.css` в статику своего приложения.
2. Подключите согласно `references/integration-steps.md` (контейнер `<div id="soft-phone-container">`, `<link>` на CSS, `<script type="module">` на JS).
3. Реализуйте прокси-аутентификацию к OCP по `references/edge-functions.md` (endpoint `/proxy/authenticate` с заголовком `Ocp-Proxy-Api-Key`).
4. Сверьтесь с инвариантами в `SKILL.md` (раздел «Инварианты, которые НЕЛЬЗЯ нарушать»).

---

## Требования к проекту клиента

- Современный фронтенд (любой фреймворк или vanilla JS).
- Backend для прокси к OCP API — хранит URL прокси и API-ключ вне браузера.
- Доступ к OCP-инстансу: URL прокси и `Ocp-Proxy-Api-Key`.
- Для фазы 2+: таблица `calls` или эквивалент в БД клиента.

Подробности — `references/prerequisites.md`.

---

## Фазы внедрения

- **Фаза 1** — виджет + аутентификация через прокси + страница настроек.
- **Фаза 2** — + регистрация звонков в БД клиента + screen pop карточки контакта.
- **Фаза 3** — + ACW и авто-Ready + click-to-call из интерфейса клиента.

Полное описание и критерии выбора — `references/phased-adoption.md`.

---

## Документация (references)

- `capabilities.md` — возможности виджета, обзор API и событий.
- `events-api.md` — сигнатуры `window.Softphone`, имена событий, поля `event.detail`.
- `phased-adoption.md` — выбор фазы внедрения.
- `prerequisites.md` — требования к окружению и стеку.
- `files-manifest.md` — какие файлы копировать в проект клиента.
- `database-schema.md` — таблицы, RLS-политики, RPC `get_softphone_settings`.
- `edge-functions.md` — функция `softphone-authenticate` и прокси.
- `integration-steps.md` — пошаговое wiring `index.html`, `main.tsx`, layout.
- `cloud-vs-self-hosted.md` — отличия Cloud (managed Supabase) и Self-Hosted Supabase.
- `screen-pop-pipeline.md` — как открывается карточка контакта на звонке.
- `strategies.md` — настройка событий открытия/закрытия карточки.
- `client-storage.md` — `localStorage` виджета, очистка при logout, debug-флаги.
- `troubleshooting.md` — частые проблемы и решения.

Дополнительно: `assets/widget-bundle-info.md` — технические детали бандла.

---

## Версия бандла

`softphone-1.0.0-beta` — см. `CHANGELOG.md`.

При обновлении бандла поднимите номер версии в `index.html` своего проекта и замените файлы в `public/softphone/`.

---

## Лицензия и поддержка

- Лицензия: **проприетарная / корпоративная**, принадлежит **ООО «Софтомнител»** (см. `LICENSE`).
- Поддержка OCP: _укажите канал поддержки вашего поставщика OCP_.
- Issues по skill и бандлу — в этом репозитории.