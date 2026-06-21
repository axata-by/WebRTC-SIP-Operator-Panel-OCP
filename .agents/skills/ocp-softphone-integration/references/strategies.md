# Strategies — какие настройки выбирать

Гайд по подбору значений в `softphone_settings` под типовые сценарии. Все ID событий —
из фиксированного множества (см. `screen-pop-pipeline.md`); любое значение вне списка
silent-игнорируется обработчиком.

## Валидные ID событий

**Открытие карточки (`open_card_events`)**:

| ID | Когда срабатывает | Источник |
|---|---|---|
| `incomingCallProgress` | Начало входящего звонка (RING) | softphone widget |
| `outgoingCallProgress` | Начало исходящего звонка (DIAL) | softphone widget |
| `OCPincomingCallProgress` | Входящий через OCP-очередь (содержит queue-метаданные) | OCP module |
| `campaignEvents` | Получены данные обзвона **до** соединения звонка | predictive dialer |
| `incomingCallAccepted` | Входящий поднят оператором | softphone widget |
| `outgoingCallAccepted` | Исходящий поднят клиентом | softphone widget |

**Закрытие карточки (`close_card_events`)**:

| ID | Когда срабатывает |
|---|---|
| `incomingCallEnded` | Завершение входящего |
| `outgoingCallEnded` | Завершение исходящего |

## Пресеты под сценарии

### A. Обычный inbound/outbound (бэк-офис, единичные звонки)
```jsonc
{
  "open_card_events":  ["incomingCallProgress", "outgoingCallProgress"],
  "close_card_events": [],                    // карточка остаётся для постобработки
  "acw_auto_ready_mode": "on_card_close",     // ACW снимается, когда оператор закрыл карточку
  "click_to_call_mode": "softphone"
}
```

### B. Контакт-центр на OCP-очередях
```jsonc
{
  "open_card_events":  ["incomingCallProgress", "outgoingCallProgress", "OCPincomingCallProgress"],
  "close_card_events": [],
  "acw_auto_ready_mode": "on_card_close",
  "click_to_call_mode": "softphone"
}
```
Зачем `OCPincomingCallProgress` отдельно: только это событие несёт `queue_id`/`queue_title`,
по которым `configLoader` подбирает специализированный конфиг карточки.

### C. Предиктивный/прогрессивный обзвон
```jsonc
{
  "open_card_events":  ["outgoingCallProgress", "campaignEvents"],
  "close_card_events": ["outgoingCallEnded"], // карточка закрывается сразу после звонка
  "acw_auto_ready_mode": "always",            // максимально быстрый возврат в очередь
  "click_to_call_mode": "softphone"
}
```
`campaignEvents` даёт карточку **до** соединения — оператор видит, кому звонит.

### D. «Открывать только после ответа» (минимум отвлечений)
```jsonc
{
  "open_card_events":  ["incomingCallAccepted", "outgoingCallAccepted"],
  "close_card_events": ["incomingCallEnded", "outgoingCallEnded"],
  "acw_auto_ready_mode": "on_call_end",
  "click_to_call_mode": "softphone"
}
```
`Progress`-события исключены → карточка не появляется на не отвеченных звонках.

### E. CRM без обязательной телефонии (часть юзеров без OCP-логина)
```jsonc
{
  "open_card_events":  ["incomingCallProgress", "outgoingCallProgress"],
  "close_card_events": [],
  "acw_auto_ready_mode": "off",
  "click_to_call_mode": "browser"             // tel: для всех, кто без софтфона
}
```

## ACW (`acw_auto_ready_mode`)

| Значение | Когда снимается ACW | Использовать когда |
|---|---|---|
| `off` | Никогда автоматически — оператор сам жмёт «Готов» | Обязательное резюме звонка, контролируемый темп |
| `on_card_close` | При сохранении/закрытии карточки звонка | Карточка ≈ результат звонка; короткий пост-вызов |
| `on_call_end` | При завершении звонка, **если карточка уже закрыта** | Сценарий «карточка закрывается до конца разговора» |
| `always` | По любому из двух условий | Outbound-кампании, агрессивный темп |

> Реализация: `src/lib/softphone/acwAutoReady.ts` → вызывает
> `window.Softphone.ocpModule.changeStatusToReady()`. Без OCP-логина у оператора
> вызов no-op.

## Click-to-Call (`click_to_call_mode`)

| Значение | Поведение `<PhoneLink>` | Когда выбирать |
|---|---|---|
| `browser` | `<a href="tel:...">` — системный диалер/Skype/Teams | Часть пользователей без OCP-логина; или используется внешний софтфон |
| `softphone` | `window.Softphone.callNumber(phone)` — звонок через виджет | Контакт-центр; нужны записи в `calls` и регистрация в OCP |

## Позиционирование виджета

| Профиль | Значения |
|---|---|
| CRM с правым sidebar | `position_anchor='top-right'`, `top_offset=60`, `right_offset=320`, `fixed_to_header=false` |
| Полноширинный desktop | `position_anchor='top-right'`, `top_offset=60`, `right_offset=20` |
| Свой хедер, хотим встроить | `fixed_to_header=true` (тогда anchor/offset игнорируются — `useSoftphonePosition` инжектит виджет в `<header>`) |

> Если виджет «прыгает» при ресайзе — проверь, что MutationObserver в `useSoftphonePosition`
> запущен и не отключён двойным mount (StrictMode). См. `troubleshooting.md`.

## Анти-комбинации

- `close_card_events = [incomingCallEnded, outgoingCallEnded]` + `acw_auto_ready_mode = on_card_close`
  → карточка успевает закрыться раньше, чем оператор её сохранил; результат может потеряться. Используй `on_call_end` или `always`.
- `open_card_events = [campaignEvents]` без `outgoingCallProgress` → если предиктивный обзвон отменит звонок, карточка останется висеть без `*Ended`-события. Всегда оставляй `outgoingCallProgress` парой к `campaignEvents`.
- `click_to_call_mode = softphone` без `auto_connect = true` → клик по телефону до того, как оператор вручную подключил виджет, ничего не сделает (no-op, без UX-фидбека).
