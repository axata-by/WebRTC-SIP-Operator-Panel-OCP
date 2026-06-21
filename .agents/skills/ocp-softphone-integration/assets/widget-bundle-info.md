# OCP Widget Bundle

Бандл — внешний, не npm-пакет; физически лежит в `public/softphone/` корня этого kit-репозитория. Подключается **статически** через `<script type="module">` в `index.html`. Не пытайся импортировать как ES-module через bundler — его нет в npm registry.

## Текущая версия

`softphone-1.0.0-beta-10.{js,css}`

## Копирование в целевой проект

```bash
# Из корня kit-репозитория в корень целевого проекта
cp -R public/softphone <target-project>/public/softphone
```

Если в `public/softphone/` есть доп. ассеты (sourcemap/шрифты/иконки) — `cp -R` подхватит всё.

## Что бандл создаёт в DOM

При монтировании в `#soft-phone-root` виджет генерирует структуру вроде:

```
#soft-phone-container
  #soft-phone-root
    #soft-phone-wrapper        ← z-index 9999
      [внутренние компоненты]
<body>
  ... портал-узлы виджета (диалер, попап звонка) — z-index 99999
```

## Window-события, которые шлёт виджет

(маппинг → internal bus есть в `src/lib/softphone/eventBus.ts`)

| Window event | Когда |
|---|---|
| `incomingCallProgress` | Пришёл входящий, прозвонка |
| `outgoingCallProgress` | Пользователь набрал, прозвонка |
| `OCPincomingCallProgress` | Входящий из OCP-очереди (с queue) |
| `incomingCallAccepted/Confirmed` | Юзер принял звонок |
| `outgoingCallAccepted/Confirmed` | Удалённая сторона ответила |
| `incomingCallEnded` / `outgoingCallEnded` | Завершение |
| `campaignEvents` | Campaign attach (исходящие кампании) |

## Window API, которое читает наш код

```ts
window.Softphone?.callNumber(num: string)
window.Softphone?.logout()
window.Softphone?.ocpModule?.changeStatusToReady()
```

Декларация типов — `src/types/global.d.ts`.

## Что НЕ делать

- ❌ Динамически грузить бандл через `loadScript()` — порядок инициализации DOM-патча сломается
- ❌ Менять id `#soft-phone-*` — захардкожены внутри бандла
- ❌ Оборачивать `#soft-phone-container` в React-портал — виджет ловит conflicts с reconciler
- ❌ Перемещать `#soft-phone-container` в header через DOM operations — позиционировать через `position: fixed` (что и делает `useSoftphonePosition`)

## Обновление версии

1. Положить новые файлы в `public/softphone/softphone-X.Y.Z.{js,css}` (оставить старые до полного отката возможным)
2. Поменять имена в `index.html` (`<link>` и `<script>`)
3. Проверить smoke-test всех фаз
4. Удалить старые файлы из `public/softphone/`

При мажорном обновлении (1.0 → 2.0) проверить, что имена window-событий и API `window.Softphone.*` не изменились. Если изменились — обновить event bus и хуки.
