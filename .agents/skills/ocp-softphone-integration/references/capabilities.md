# WebRTC Softphone — полный каталог возможностей

Первоисточник: `assets/webrtc-softphone-v12.pdf` (ПАК КЦ, WebRTC Softphone v12). Этот файл — структурированная выжимка возможностей продукта. Используется как «что встроить»; «как встроить» — в остальных reference-файлах skill.

> **Точные сигнатуры методов `window.Softphone` и поля `event.detail` для всех событий** (включая `campaignEvents`, `ocpNotification`, OCP-префиксные, `authenticateOCPModule`) — в `events-api.md` (источник `assets/webrtc-softphone-events-api-v12.pdf`).

---

## 1. Назначение и архитектура

- Браузерный SIP-телефон без установки ПО, встроен в корпоративные UI (CRM, helpdesk, портал).
- Стек: **JsSIP** (RFC 3261 SIP, RFC 7118 SIP over WebSocket) + **WebRTC** медиа + **WebSocket**.
- Подключение к **Session Border Controller (SBC)** — SBS Axatel.
- Интеграция с **OCP (Omnichannel Communication Platform)**: авторизация, статусы оператора, очереди.
- Лицензия библиотеки — MIT.

**Состав модуля:**
- UI-панель оператора;
- SIP-агент на JsSIP;
- Авторизационный прокси (в нашей схеме — edge `softphone-authenticate`);
- Карточка вызова и подсистема статусов;
- Журнал звонков и debug-консоль;
- Шина событий для внешних систем.

**Ограничения** (из PDF, гл. 3.7):
- Одновременные вызовы лимитированы браузером/железом.
- Интеграция с CRM — отдельная настройка API/авторизации.
- Поведение зависит от конфигурации SBC и лицензии.

---

## 2. Функциональные возможности

| Фича | Описание |
|---|---|
| **Call** | Входящие и исходящие SIP-вызовы (внутренние, внешние мобильные/городские) |
| **Hold / Unhold** | Кнопка `⏸` → `▶`. Опция «авто-снятие с удержания» в общих настройках |
| **Blind Transfer** | Перевод без сопровождения. Кнопка 🔄 → набор → «Позвонить и положить» (исходный звонок авто-hold) |
| **Attended Transfer** | Перевод с сопровождением. Кнопка 🔄 → набор → «Позвонить», поговорить, затем завершить |
| **Параллельные вызовы** | 3–5 одновременных. При приёме нового — все предыдущие авто-hold; на линии всегда только последний |
| **Auto Answer** | Автоматический ответ через настраиваемый таймаут (сек). Вкл/выкл в общих настройках |
| **DND** (Не беспокоить) | Режим отклонения входящих. Включается из меню `⋮` или общих настроек |
| **Журнал звонков** | Входящие/исходящие/пропущенные. Открытие из `:::` или меню. Повторный вызов: double-click по записи **или** Enter в поле ввода + навигация ↑/↓ по истории |
| **Нормализация номера** | Локальный/международный/внутренний/короткий. Нормализация на стороне SBC |
| **Очистка ввода** | «×» — стирает одну цифру, удержание ~1 сек — весь номер |
| **Mute / Unmute** | Микрофон 🎤 в карточке звонка (красный с перечёркиванием — выключен) |
| **Смена статуса оператора** | Online / Offline / DND, плюс отклонение входящего через смену статуса |
| **Планирование статуса** | Запланированный переход оператора после завершения текущего разговора |
| **Повторная регистрация** | Авто-reregister с таймаутом (сек), общие настройки |

---

## 3. Интерфейс

**Основные элементы** (гл. 6 PDF):

- **Панель набора номера** — поле ввода + dialpad (1–9, *, 0/+, #);
- **Кнопка вызова** «Позвонить» (синяя);
- **Кнопки в карточке звонка**: микрофон, hold, transfer, end;
- **Статусная панель**: Online / Offline (с таймером) / DND / статус SIP-регистрации;
- **Карточка входящего**: «Входящий вызов», номер, имя (если есть из CRM), таймер автоответа, кнопки «Ответить» / «Отклонить»;
- **Журнал звонков** — список с типом, длительностью, временем;
- **Меню `⋮`**: Перезагрузка, Журнал звонков, Включить/выключить DND, Настройки, Выйти.

**Поведение окна:**
- Drag-and-drop (включается в общих настройках, «Режим перетаскивания»);
- Pin — закрепление в произвольной части экрана;
- Сворачивание (`—`) → компактный вид;
- Разворачивание (`🧱`) → полная панель.

**Темы оформления:**
- Светлая (default), Тёмная (переключатель в общих настройках), Custom CSS (подключение собственной темы через конфигурацию).

**Настройки (3 вкладки):**

1. **Аккаунт**: Логин, Пароль, Домен, Адрес сервера (URL SBC).
2. **Общие**:
   - Debug-режим (on/off);
   - Тема (Light/Dark);
   - Авто снятие с удержания;
   - Автоответчик + таймаут (сек);
   - Повторная регистрация + таймаут (сек);
   - Окно входящего вызова (on/off);
   - Режим перетаскивания (on/off).
3. **Кодеки**: `audio/opus` (minptime=10; useinbandfec=1), `audio/red` (111/111), `audio/G722`, `audio/PCMU`, `audio/PCMA`, `audio/CN`, `audio/telephone-event`. Каждый отдельным чекбоксом.

---

## 4. Типы интеграции (гл. 5 PDF) → мэппинг на skill

| Тип в PDF | Что это | Где в skill |
|---|---|---|
| **Standalone Embed** | HTML/iframe + ручной ввод SIP-кредов оператором | Не наш путь — игнорируем |
| **Auth Proxy** | Прокси авторизует через backend, креды скрыты от оператора | **Наш Phase 1.** Edge `softphone-authenticate` + `softphone_settings` → `references/edge-functions.md`, `references/database-schema.md` |
| **OCP Integration** | Синхронизация авторизации, статусов, очередей через OCP | Покрыто Phase 1+2 (auto-connect, статусы, события очередей) |
| **CRM Integration: Simple** | Карточка по номеру | Покрыто фрагментом Phase 2 (lookup по 9-digit suffix → `mem://features/screen-pop-entity-resolution-logic`) |
| **CRM Integration: Deep** | Авто-открытие карточки + передача номера/длительности/записи | **Наш Phase 2.** `references/screen-pop-pipeline.md` |
| **CRM Integration: Event-based** | CRM подписывается на события виджета | **Наш Phase 2+3.** `useSoftphoneCallHandler`, `eventBus` |
| **Monitoring/BI** | События в Zabbix/Grafana/Superset/PowerBI | Не в скоупе skill (можно сделать через webhook subscriptions из `eventBus`) |

---

## 5. События и API (`window.Softphone`)

> Полные сигнатуры — в `assets/webrtc-softphone-v12.pdf` главы 7+. Здесь — каркас, синхронизированный с тем, что уже использует наш `eventBus.ts` и хуки.

**Методы:**
- `authorize(domain, token)` — авторизация через OCP-прокси;
- `accept()` / `reject()` — приём/отклонение входящего;
- `makeCall(number)` — исходящий;
- `hold()` / `unhold()`;
- `transfer(number, mode)` — `blind` / `attended`;
- `mute()` / `unmute()`;
- `setStatus(status)` — смена статуса оператора (включая «Ready» для ACW).

**События виджета (базовые):**
- `connected` — WebSocket поднят;
- `registered` — SIP-регистрация прошла;
- `ringing` — звонит;
- `accepted` — ответили;
- `ended` — завершён;
- `hold` / `unhold`;
- `mute` / `unmute`.

**События OCP (используются в screen pop):**
- `incomingCallProgress` — начало входящего;
- `outgoingCallProgress` — начало исходящего;
- `OCPincomingCallProgress` — входящий через очередь OCP;
- `incomingCallAccepted` / `outgoingCallAccepted` — приём звонка;
- `incomingCallEnded` / `outgoingCallEnded` — завершение;
- `campaignEvents` — данные кампании предиктивного обзвона (приходит **до** звонка);
- `ocpNotification` — служебные уведомления OCP-модуля.

Список валидных значений `open_card_events` / `close_card_events` для `softphone_settings` см. в `references/strategies.md`.

**Авторизация OCP** — пара `(domain, token)` через прокси-сервис; в нашей реализации это edge `softphone-authenticate`, который добавляет `Ocp-Proxy-Api-Key` и проксирует на `${ocp_proxy_url}/proxy/authenticate?login=...`.

---

## 6. Use Cases (гл. 1.7 PDF)

- Приём входящего → ответ → разговор → завершение → (опционально) ACW авто-Ready;
- Исходящий → набор → дозвон → разговор → завершение;
- Blind transfer → 🔄 → набор → «Позвонить и положить»;
- Attended transfer → 🔄 → набор → «Позвонить» → консультация → завершить исходный;
- Параллельные вызовы → авто-hold предыдущих;
- Auto Answer для исходящего обзвона / предиктивных кампаний;
- Login / Logout (в нашем варианте — авто через `useSoftphoneAutoConnect`).

---

## 7. Отладка

- **Debug-режим** в общих настройках → отображает SIP- и WebSocket-события в консоли;
- Консоль содержит статусы, ошибки авторизации, SDP;
- Подписка на события в реальном времени (см. `eventBus` нашего проекта);
- Полезно при траблшутинге — см. `references/troubleshooting.md`.

> Состояние Debug / DND / Theme / журнала / SIP-конфига хранится виджетом в `localStorage` браузера (ключи `debug`, `isDND`, `theme`, `JSSIP_CALL_HISTORY`, `JSSIP_CONFIGS`, `lastUAInstance`, `force_sendonly`). Полная таблица + правила logout-cleanup — в `references/client-storage.md`.

---

## 8. Связанные файлы skill

| Что нужно | Файл |
|---|---|
| Пофазное внедрение и scope-выбор | `references/phased-adoption.md` |
| Список файлов для копирования | `references/files-manifest.md` |
| Схема БД (singleton settings, screen pop configs) | `references/database-schema.md` |
| Edge-функции (auth-proxy) | `references/edge-functions.md` |
| Wiring HTML / main.tsx / Layout | `references/integration-steps.md` |
| Pipeline вызова карточки (DOM → eventBus → `<CallScreenPop>`) | `references/screen-pop-pipeline.md` |
| Готовые пресеты событий + ACW / click-to-call | `references/strategies.md` |
| Cloud vs Self-Hosted различия | `references/cloud-vs-self-hosted.md` |
| Пререкизиты | `references/prerequisites.md` |
| Траблшутинг | `references/troubleshooting.md` |
| Инфо о бандле | `assets/widget-bundle-info.md` |
| PDF-первоисточник | `assets/webrtc-softphone-v12.pdf` |
