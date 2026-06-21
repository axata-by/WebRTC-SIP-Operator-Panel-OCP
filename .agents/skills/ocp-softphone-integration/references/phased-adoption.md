# Phased Adoption

Skill поддерживает три фазы. Пользователь явно выбирает scope через первый вопрос `ask_questions`.

## Phase 1 — Minimum Viable

**Что даёт**: виджет в углу экрана, ручное/авто подключение к OCP, страница настроек. **Без** регистрации звонков в БД, **без** screen pop, **без** click-to-call.

**Идеально для**: проектов, которым нужно просто дать пользователю звонилку в браузере; интеграция с бэкенд-моделями звонков делается отдельно или вообще не нужна.

**Шаги**:
1. `prerequisites.md`
2. `files-manifest.md` — раздел Phase 1
3. `database-schema.md` — раздел Phase 1
4. `edge-functions.md` — только `softphone-authenticate`
5. `integration-steps.md` — шаги 1, 2, 3, 4, 5
6. Smoke-test шаги 1–3

## Phase 2 — Регистрация звонков + Screen Pop

**Дополнительно к Phase 1**: входящие/исходящие/OCP события создают записи в `calls`; открывается screen pop с конфигурируемыми секциями.

**Зависимости**: таблица `calls` с требуемыми колонками **уже существует** в целевом проекте. Это **не** входит в скоуп skill — это полноценная модель домена.

**Шаги**:
1. Сначала полностью Phase 1
2. `files-manifest.md` — раздел Phase 2
3. `database-schema.md` — раздел Phase 2 (`call_screen_pop_configs`)
4. `edge-functions.md` — `softphone-call-answer`, `softphone-call-finish`, `softphone-event`
5. `integration-steps.md` — шаг 6 (ActiveCallProvider + CallScreenPop)
6. Включить хук `useSoftphoneCallHandler()` в `SoftphoneIntegration.tsx`
7. Создать хотя бы одну запись в `call_screen_pop_configs` (через UI или INSERT)
8. Smoke-test шаг 4

## Phase 3 — ACW + Click-to-Call

**Дополнительно**: после звонка авто-Ready (`window.Softphone.ocpModule.changeStatusToReady`), `<PhoneLink>` компонент уважает `click_to_call_mode`.

**Не требует** Phase 2 — можно ставить поверх Phase 1, но без screen pop ACW логика `on_card_close` не имеет смысла; оставь `acw_auto_ready_mode = off` или `on_call_end`.

**Шаги**:
1. Phase 1 (минимум)
2. `files-manifest.md` — раздел Phase 3
3. Заменить `<a href="tel:...">` на `<PhoneLink>` в UI
4. Если Phase 2 развёрнута — в `useSoftphoneCallHandler` уже есть вызов `notifySoftphoneCardClosed()`; убедиться, что он включён
5. Установить `acw_auto_ready_mode` через настройки UI
6. Smoke-test шаг 5

## Anti-patterns

- ❌ Phase 2 без Phase 1 — невозможно, виджет не загрузится
- ❌ Phase 3 без хука `useSoftphoneAutoConnect` — `window.Softphone` не будет инициализирован
- ❌ Копировать `useSoftphoneCallHandler.ts` без таблицы `calls` — упадёт при первой записи
- ❌ Менять имя `#soft-phone-container` / `#soft-phone-root` / `#soft-phone-wrapper` — это контракт бандла виджета, ломать нельзя
