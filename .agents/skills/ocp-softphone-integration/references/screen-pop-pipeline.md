# Screen Pop Pipeline — как вызывается карточка

Сквозной поток от события OCP-виджета до отрендеренной карточки. Релевантно начиная с **Phase 2**.

## Поток открытия

```
softphone widget DOM event (CustomEvent на window)
   incomingCallProgress | outgoingCallProgress | OCPincomingCallProgress
   | campaignEvents | incomingCallAccepted | outgoingCallAccepted
        │
        ▼
src/lib/softphone/eventBus.ts
   слушает window.addEventListener(<rawName>, ...)
   нормализует callId через normalizeCallId(), пробрасывает в внутреннюю шину
        │
        ▼
src/hooks/useSoftphoneCallHandler.ts (подписан на шину через useSoftphoneEvents)
   ├─ shouldOpenCard(eventType)
   │     return settings.open_card_events.includes(eventType)
   │     если false — handler выходит, карточка НЕ открывается
   ├─ createCallRecord(...)               INSERT public.calls (idempotent по external_call_id)
   ├─ tryAttachCampaignData(callId)       campaignDataStore: матч по 9-значному суффиксу телефона
   └─ ActiveCallContext.openCard(callId)  пушит callId в активные карточки (multi-tab)
        │
        ▼
<CallScreenPop />  (отрендерен внутри <ActiveCallProvider>)
   подписан на ActiveCallContext.activeCalls — рендерит таб на каждый активный звонок
        │
        ▼
src/lib/softphone/configLoader.ts
   подбор записи из public.call_screen_pop_configs:
     1. is_active = true И call_directions ∋ direction И (queue_names = {} ИЛИ ∋ queue)
        → кандидаты; выбирается с MAX(priority)
     2. иначе is_default = true → fallback
     3. иначе → warning, карточка пустая
        │
        ▼
рендер sections + tabs из jsonb-конфига
   (контакты, сделки, custom-elements — см. memory features/screen-pop-*)
```

## Поток закрытия

```
incomingCallEnded | outgoingCallEnded  (DOM event)
        │
        ▼
useSoftphoneCallHandler.handleCallEnded(eventType, data)
   ├─ shouldCloseCard(eventType)
   │     return settings.close_card_events.includes(eventType)
   ├─ если true → ActiveCallContext.closeCard(callId)
   └─ если acw_auto_ready_mode in ('on_call_end','always')
         и карточка УЖЕ закрыта → acwAutoReady.notifyCallEnded()
              → window.Softphone.ocpModule.changeStatusToReady()
```

Закрытие может быть инициировано пользователем (кнопка «Закрыть» в карточке):
```
user clicks close
   → ActiveCallContext.closeCard(callId)
   → notifySoftphoneCardClosed(callId)
      → если acw_auto_ready_mode in ('on_card_close','always')
         → acwAutoReady.notifyCardClosed() → changeStatusToReady()
```

## Особый кейс: предиктивный/прогрессивный обзвон

`campaignEvents` приходит **раньше** `outgoingCallProgress` — система обзвона
успевает прислать данные о клиенте до того, как звонок физически соединился.

```
campaignEvents (call_id, client_phone, queue_id, ...)
   → storeCampaignData(...)
      сохраняет в Map по ключам: call_id | strategy_call_id | phone:<9-digit-suffix>
      TTL 30s (см. memory architecture/softphone/progressive-dialing-deduplication)
   → если open_card_events ∋ campaignEvents → openCard сразу (карточка пустая, заполняется по мере событий)

позже: outgoingCallProgress (тот же call_id или 9-значный суффикс)
   → tryAttachCampaignData(...) находит сохранённое, мерджит в call record
   → cleanupCampaignData() очищает Map
```

Без `campaignEvents` в `open_card_events` карточка откроется только в момент
`outgoingCallProgress`, и оператор не увидит «куда звонит» до соединения.

## Ключевые контракты

| Сущность | Где живёт | Контракт |
|---|---|---|
| Имена DOM-событий | `eventBus.ts` константа `RAW_EVENT_NAMES` | Менять только синхронно с бандлом виджета |
| `open_card_events` / `close_card_events` | `softphone_settings` text[] | Только ID из множества выше; неизвестный ID → событие игнорируется |
| `ActiveCallProvider` | `src/components/calls/screen-pop/context/ActiveCallContext.tsx` | Должен оборачивать `<Routes>`, иначе `useActiveCall()` бросает |
| `CallScreenPop` | `src/components/calls/screen-pop/CallScreenPop.tsx` | Монтируется ровно один раз, рендерит вкладки сам |
| `call_screen_pop_configs` | таблица | Минимум одна `is_default=true` запись |

## Антипаттерны

- ❌ Импортировать `useSoftphoneCallHandler` вне `<ActiveCallProvider>` — `openCard` крашится.
- ❌ Указывать в `open_card_events` ID, которого нет в `RAW_EVENT_NAMES` — silent skip, очень неочевидный баг.
- ❌ Включать `campaignEvents` в `open_card_events` без таблицы `outbound_*` в проекте — карточка будет открываться пустой на каждый campaign-event без последующего звонка.
- ❌ Удалять seed-запись `is_default=true` из `call_screen_pop_configs` — карточка перестанет открываться для любых звонков, не подпавших под queue-конфиги.
