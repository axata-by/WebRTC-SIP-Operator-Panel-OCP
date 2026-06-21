# Client-Side Storage (браузерный `localStorage` виджета)

CRM-сторона хранит **все** настройки софтфона в БД (`softphone_settings` singleton + `profiles.telephony_login`) и **не** использует `localStorage` для софтфон-логики. Но **сам бандл виджета** (`public/softphone/softphone-*.js`, основан на JsSIP) пишет в `localStorage` браузера пользователя 7 ключей. Их нужно знать для трёх сценариев: **logout**, **auto-connect**, **troubleshooting**.

---

## Полный список ключей

| Ключ | Тип | Кто пишет | Когда читается | Безопасно удалить? | Чистить при logout? |
|------|-----|-----------|----------------|--------------------|--------------------|
| `JSSIP_CONFIGS` | JSON | виджет после успешной SIP-регистрации | при автоинициализации SIP-стека до получения нового `authenticateOCPModule` | да | **ДА** (иначе следующий юзер унаследует чужие SIP-креды) |
| `JSSIP_CALL_HISTORY` | JSON-массив | виджет на каждое событие звонка | при открытии вкладки «Журнал» в виджете | да | **ДА** (PII предыдущего юзера) |
| `lastUAInstance` | string | виджет при создании UA | при reload — для авто-restart SIP UA | да | **ДА** (иначе залипает регистрация старого пользователя) |
| `isDND` | `"true"`/`"false"` | пользователь через тумблер DND в виджете | при инициализации виджета | да | НЕТ (UX-настройка) |
| `theme` | `"light"`/`"dark"`/... | пользователь через переключатель темы | при инициализации виджета | да | НЕТ (UX-настройка) |
| `debug` | `"true"`/`"false"` | вручную через DevTools (см. troubleshooting) | при инициализации SIP-стека и WebSocket | да | НЕТ (опционально) |
| `force_sendonly` | `"true"`/`"false"` | вручную через DevTools | при создании media stream | да | НЕТ (диагностический флаг) |

> Все ключи — **глобальные** для origin (не привязаны к юзеру или сессии Supabase). Поэтому при смене пользователя на одном устройстве **обязателен** explicit cleanup тройки `JSSIP_CONFIGS` / `JSSIP_CALL_HISTORY` / `lastUAInstance`.

---

## Logout cleanup (обязательный snippet)

Добавить в `useAuth.signOut` **до** `supabase.auth.signOut()`:

```ts
// Очистить локальное состояние софтфон-виджета,
// чтобы следующий пользователь на этом устройстве
// не унаследовал чужую SIP-регистрацию и журнал звонков.
try {
  localStorage.removeItem('JSSIP_CONFIGS');
  localStorage.removeItem('JSSIP_CALL_HISTORY');
  localStorage.removeItem('lastUAInstance');
} catch {}

// Параллельно — скрыть контейнеры (уже описано в integration-steps.md)
const c = document.getElementById('soft-phone-container');
const w = document.getElementById('soft-phone-wrapper');
if (c) c.style.display = 'none';
if (w) w.style.display = 'none';

// Опционально — попросить виджет завершить SIP-сессию,
// если он ещё активен (без этого UA может висеть до закрытия вкладки)
try { window.Softphone?.logout?.(); } catch {}
```

`isDND` / `theme` / `debug` / `force_sendonly` **не** трогать — это персональные UX-настройки устройства, а не пользователя.

---

## Связь с `softphone_settings.auto_connect`

`auto_connect=true` в БД работает корректно **только при наличии валидного `JSSIP_CONFIGS`** в `localStorage`:

1. **Первый коннект** (или после logout-cleanup) — `JSSIP_CONFIGS` пуст → нужно выслать `authenticateOCPModule` (см. `events-api.md`), виджет получит токен и **сам сохранит** `JSSIP_CONFIGS`.
2. **Последующие reload** — виджет читает `JSSIP_CONFIGS` и регистрируется без обращения к `softphone-authenticate`.

Поэтому `useSoftphoneAutoConnect` всегда делает full-cycle через `softphone-authenticate` + `dispatchEvent('authenticateOCPModule')` — не полагается на `localStorage` напрямую.

---

## Troubleshooting через `localStorage`

```js
// Включить подробный лог SIP/WebSocket (требует reload вкладки):
localStorage.setItem('debug', 'true');
location.reload();

// Сбросить «прилипшую» регистрацию (виджет показывает онлайн, но звонки не идут):
localStorage.removeItem('JSSIP_CONFIGS');
localStorage.removeItem('lastUAInstance');
location.reload();
// → затем повторить connect (кнопка-наушники или auto-connect)

// Принудительно sendonly-аудио (для диагностики проблем с микрофоном):
localStorage.setItem('force_sendonly', 'true');

// Полный wipe виджет-состояния (как при logout):
['JSSIP_CONFIGS','JSSIP_CALL_HISTORY','lastUAInstance','isDND','theme','debug','force_sendonly']
  .forEach(k => localStorage.removeItem(k));
```

---

## Что НЕ хранится в `localStorage`

- Все CRM-настройки софтфона (включая `ocp_proxy_api_key`) — только в БД, читаются через RPC `get_softphone_settings`.
- `telephony_login` пользователя — только в `profiles`.
- Конфиги screen-pop карточек (`call_screen_pop_configs`) — только в БД.
- `open_card_events` / `close_card_events` — только в БД.
- Bearer/auth токен Supabase — в `localStorage`, но это `sb-...` ключи самого SDK, не часть софтфон-стека.

См. также:
- `database-schema.md` — серверные настройки.
- `integration-steps.md` — куда вставить logout cleanup.
- `troubleshooting.md` — расширенные сценарии диагностики.
