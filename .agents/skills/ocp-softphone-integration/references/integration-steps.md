# Integration Steps (Wiring)

Применять после копирования файлов (files-manifest.md) и миграции (database-schema.md).

## 1. index.html

Добавить в <head> после остальных стилей:

<link rel="stylesheet" href="/softphone/softphone-1.0.0-beta-10.css">
<style>
  #soft-phone-container {
    z-index: 9999 !important;
    position: fixed !important;
    display: none; /* становится block после подключения */
  }
  #soft-phone-wrapper { z-index: 9999 !important; }
</style>

Перед </body> (до <script> приложения):

<div id="soft-phone-container">
  <div id="soft-phone-root"></div>
</div>
<script type="module" src="/softphone/softphone-1.0.0-beta-10.js"></script>

> Виджет монтируется в #soft-phone-root сам, синхронно при загрузке скрипта. Никакой динамической загрузки через loadScript() — это сломает порядок инициализации.

## 2. src/main.tsx

Первой строкой файла:

import './lib/dom-patch';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// ... остальное содержимое файла main.tsx

## 3. AppLayout

Создать (или дополнить существующий) src/components/SoftphoneIntegration.tsx:

import { useSoftphonePosition } from "@/hooks/useSoftphonePosition";
import { useSoftphoneAutoConnect } from "@/hooks/useSoftphoneAutoConnect";
import { useSoftphoneSettings } from "@/hooks/useSoftphoneSettings";
import { useSoftphoneCallHandler } from "@/hooks/useSoftphoneCallHandler";

export function SoftphoneIntegration() {
  const { settings } = useSoftphoneSettings();

  // Хуки безопасно работают если settings === null (грузятся)
  useSoftphonePosition();
  useSoftphoneAutoConnect();
  useSoftphoneCallHandler();

  if (settings?.enabled === false) return null;
  return null; // компонент только запускает хуки, не рендерит UI
}

Подключить в основном лейауте (AppLayout.tsx или src/App.tsx):

<>
  <SoftphoneIntegration />
  <Outlet />
</>

## 4. useAuth.signOut

В функции выхода скрыть контейнеры виджета **и очистить `localStorage`-ключи виджета** (иначе следующий юзер на устройстве унаследует чужую SIP-регистрацию и журнал звонков — см. `client-storage.md`):

async function signOut() {
  // ... существующая логика выхода

  // Cleanup widget localStorage (обязательно!)
  try {
    localStorage.removeItem('JSSIP_CONFIGS');
    localStorage.removeItem('JSSIP_CALL_HISTORY');
    localStorage.removeItem('lastUAInstance');
  } catch {}
  try { window.Softphone?.logout?.(); } catch {}

  const container = document.getElementById('soft-phone-container');
  const wrapper = document.getElementById('soft-phone-wrapper');
  if (container) container.style.display = 'none';
  if (wrapper) (wrapper as HTMLElement).style.display = 'none';
}

> Без cleanup `localStorage` и скрытия контейнеров — баг безопасности (PII + SIP-креды предыдущего пользователя).

## 5. Роутинг страницы настроек

В src/pages/Settings.tsx (или эквиваленте) добавить вкладку/секцию «Настройки софтфона» → монтирует <SoftphoneSettingsPage />.

import { SoftphoneSettingsPage } from "@/components/settings/softphone";
import { Phone } from "lucide-react";

// ... в массиве категорий настроек:
{ id: "softphone", label: "Софтфон", icon: Phone, component: SoftphoneSettingsPage }

## 6. (Phase 2) Screen Pop рендер

Где-то в App (обычно над основным контентом, ниже хедера):

import { CallScreenPop } from "@/components/calls/screen-pop/CallScreenPop";
import { ActiveCallProvider } from "@/components/calls/screen-pop/context/ActiveCallContext";

<ActiveCallProvider>
  <CallScreenPop />
  {/* остальные роуты */}
</ActiveCallProvider>

## 7. (Phase 3) PhoneLink в UI

Заменить все <a href="tel:..."> в проекте на:

import { PhoneLink } from "@/components/ui/PhoneLink";

<PhoneLink phone={contact.phone} />

Компонент сам определит режим (browser / softphone) из softphone_settings.click_to_call_mode.

## Финальный smoke-test

1. Залогиниться → виджет появляется в правом верхнем углу.
2. Открыть /settings → Софтфон → отредактировать ocp_proxy_url, сохранить, перезагрузить страницу — поле сохранилось.
3. Включить auto_connect = true, выставить profiles.telephony_login для своего юзера → перелогиниться → виджет коннектится автоматически.
4. (Phase 2) Сделать тестовый звонок через интерфейс виджета → screen pop открывается, запись в calls создаётся.
5. (Phase 3) Кликнуть по <PhoneLink> в режиме softphone → window.Softphone.callNumber(...) вызывается.
