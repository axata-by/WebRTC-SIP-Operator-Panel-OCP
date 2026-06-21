# events-api.md — Точный справочник `window.Softphone` API и событий

> Нормативный источник: `assets/webrtc-softphone-events-api-v12.pdf` («ПАК КЦ — События и API взаимодействия WebRTC Softphone v12»).
> Этот файл — операционная выжимка для интеграции. Для обзора возможностей — см. `capabilities.md`. Для маппинга на screen pop / `softphone_settings.open_card_events` — см. `screen-pop-pipeline.md` и `strategies.md`.

---

## 1. Методы `window.Softphone` (JavaScript API)

Все методы вызываются на глобальном объекте `window.Softphone` после загрузки бандла (`public/softphone/...js`).

| Метод | Аргументы | Назначение |
|---|---|---|
| `Softphone.answer()` | — | Принять активный входящий вызов |
| `Softphone.hangup()` | — | Завершить/отклонить текущий вызов |
| `Softphone.authorize()` | — | Авторизовать SIP-клиента (после получения учётных данных через прокси) |
| `Softphone.logout()` | — | Разрегистрировать SIP-клиента |
| `Softphone.getActiveCallId()` | — | Вернуть `callId` текущей активной сессии |
| `Softphone.callNumber(number)` | `number: string` | Инициировать исходящий звонок. **Если есть активная сессия — переводит её на удержание** |
| `Softphone.ocpModule.changeStatusToReady()` | — | Перевести оператора из «Поствызовная обработка» в «Доступен» |
| `Softphone.ocpModule.changeStatusToBreak()` | — | Перевести оператора из «Поствызовная обработка» в «Перерыв» |

> `ocpModule.*` доступны только после успешной авторизации OCP-модуля (см. §5).

---

## 2. Базовые события Softphone

Подписка: `window.addEventListener('eventName', (e) => use(e.detail))`.

| Событие | `event.detail` | Описание |
|---|---|---|
| `connectedEvent` | — | WebSocket-соединение с SBC установлено |
| `registered` | — | SIP-клиент зарегистрирован |
| `unregistered` | — | SIP-клиент разрегистрирован |
| `registrationFailed` | — | Ошибка регистрации SIP-клиента |
| `incomingCallProgress` | `{callId, callerId, calledId}` | Получен INVITE на входящий |
| `outgoingCallProgress` | `{callId, callerId, calledId}` | Исходящий вызов в процессе |
| `incomingCallAccepted` | `{callId, callerId, calledId}` | Входящий принят оператором |
| `outgoingCallAccepted` | `{callId, callerId, calledId}` | Исходящий принят абонентом |
| `incomingCallConfirmed` | `{callId, callerId, calledId}` | Медиаканал (WebRTC) по входящему установлен |
| `outgoingCallConfirmed` | `{callId, callerId, calledId}` | Медиаканал по исходящему установлен |
| `incomingCallEnded` | `{callId, callerId, calledId}` | Входящий завершён |
| `outgoingCallEnded` | `{callId, callerId, calledId}` | Исходящий завершён |
| `hold` | `{callId}` | Вызов поставлен на удержание |
| `unhold` | `{callId}` | Вызов снят с удержания |
| `mute` | `{audio: boolean, video: boolean}` | Микрофон/видео выключены |
| `unmute` | `{audio: boolean, video: boolean}` | Микрофон/видео включены |

---

## 3. События OCP-модуля (префикс `OCP`)

Эмитируются параллельно базовым, когда звонок проходит через OCP (очереди, кампании). Содержат **расширенный `detail`** с привязкой к OCP.

| Событие | Описание |
|---|---|
| `OCPincomingCallProgress` | Входящий через OCP в стадии прогресса (INVITE) |
| `OCPoutgoingCallProgress` | Исходящий через OCP в стадии прогресса |
| `OCPincomingCallAccepted` | Входящий через OCP принят оператором |
| `OCPoutgoingCallAccepted` | Исходящий через OCP принят абонентом |
| `OCPincomingCallConfirmed` | Медиаканал по входящему через OCP |
| `OCPoutgoingCallConfirmed` | Медиаканал по исходящему через OCP |
| `OCPincomingCallEnded` | Входящий через OCP завершён |
| `OCPoutgoingCallEnded` | Исходящий через OCP завершён |

### 3.1 Поля `event.detail` для OCP-событий

| Поле | Описание |
|---|---|
| `main_acallid` | Уникальный ID звонка в OCP-системе. **Может отсутствовать** (например, до того как звонок «привязался» к OCP-сессии) |
| `acallid` | Уникальный ID звонка в софтфоне |
| `event` | Название исходного (базового) события софтфона |
| `caller_id` | Идентификатор звонящего |
| `called_id` | Идентификатор вызываемого |
| `queue` | Название очереди |

> ⚠️ В исходной таблице базовых событий используется camelCase (`callerId`, `calledId`), а в OCP-`detail` — snake_case (`caller_id`, `called_id`). При обработке учитывать оба варианта.

---

## 4. Событие `campaignEvents`

Эмитируется при получении данных по абоненту в рамках кампании исходящего обзвона (до/во время звонка). Используется для screen pop и enrichment.

| Поле | Описание |
|---|---|
| `id` | Уникальный ID события |
| `call_id` | Уникальный ID звонка |
| `queue_id` | ID очереди |
| `queue_title` | Название очереди |
| `abonent_id` | ID абонента |
| `company_id` | ID кампании |
| `company_title` | Название кампании |
| `selection_id` | ID селекции |
| `selection_title` | Название селекции |
| `strategy_call_id` | ID стратегии обзвона |
| `strategy_title` | Название стратегии |
| `client_phone` | Номер клиента |
| `is_answered` | `boolean` — ответил ли оператор |
| `progressive` | `boolean` — прогрессивная ли кампания |

---

## 5. Событие `ocpNotification`

Уведомления от OCP-модуля для отображения в UI оператора.

| Поле | Тип / значения | Описание |
|---|---|---|
| `id` | `string` | ID нотификации |
| `UUID` | `string \| undefined` | ID цепочки нотификаций |
| `type` | `'preloader' \| 'progress' \| 'success' \| 'error' \| 'warning' \| 'notify' \| 'help'` | Тип уведомления |
| `body` | `string` | Текст |
| `time` | `number` | Время показа (мс) |
| `blocked` | `boolean` | Блокирует ли действия пользователя |
| `deleted` | `boolean` | Можно ли удалить |
| `sticky` | `boolean` (опц.) | Закреплено при скролле |
| `position` | `'top-left' \| 'top-right' \| 'center'` | Позиция на экране |

---

## 6. Авторизация OCP-модуля

Софтфон в состоянии ожидания подписывается на исходящее событие **`authenticateOCPModule`**, которое **диспатчит само приложение** после получения domain/token (обычно через наш edge `softphone-authenticate` → ответ с `ocpDomain`/`ocpAuthToken`).

```js
window.dispatchEvent(new CustomEvent('authenticateOCPModule', {
  detail: {
    ocpDomain: '...',     // домен OCP-модуля
    ocpAuthToken: '...',  // токен OCP-модуля
  }
}));
```

| Поле `detail` | Описание |
|---|---|
| `ocpDomain` | Домен для соединения с OCP-модулем |
| `ocpAuthToken` | Токен для авторизации OCP-модуля |

---

## 7. Паттерн подписки

```js
function onCall(e) {
  const { callId, callerId, calledId } = e.detail || {};
  // ...
}
window.addEventListener('incomingCallProgress', onCall);

// cleanup
window.removeEventListener('incomingCallProgress', onCall);
```

В React — выносить подписку в `useEffect` с зависимостью на стабильный handler (см. `useSoftphoneCallHandler` см. `assets/reference-code/src/hooks/useSoftphoneCallHandler.ts`).

---

## 8. Кросс-ссылки

- **`capabilities.md`** — что виджет умеет в целом (UI, темы, transfer, ACW и т.д.).
- **`screen-pop-pipeline.md`** — какие из этих событий триггерят открытие/закрытие карточки и как.
- **`strategies.md`** — валидное множество ID для `softphone_settings.open_card_events` / `close_card_events`.
- **`edge-functions.md`** — где формируется ответ для `authenticateOCPModule` (`softphone-authenticate`).
