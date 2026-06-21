# Edge Functions

## Phase 1: `softphone-authenticate`

**Назначение**: проксирует логин через внешний OCP-proxy, возвращает `softphone_auth_token`.

**Контракт**:
- `POST /functions/v1/softphone-authenticate`
- Body: `{ "login": "operator123" }`
- Auth: JWT (виджет вызывает из браузера от имени залогиненного юзера; `verify_jwt = true` по умолчанию)
- Response 200: `{ "softphone_auth_token": "..." }`
- Response 4xx/5xx: `{ "error": "..." }`

**Что делает внутри** (готовый исходник: `assets/reference-code/supabase/functions/softphone-authenticate/index.ts`):
1. Читает строку `softphone_settings` через service-role-клиент.
2. Берёт `ocp_proxy_url` и `ocp_proxy_api_key`.
3. Делает `GET ${ocp_proxy_url}/proxy/authenticate?login=...` с заголовком `Ocp-Proxy-Api-Key`.
4. Возвращает `softphone_auth_token` из ответа прокси.

**Cloud**: деплоится автоматически после копирования файла.
**Self-Hosted**: после копирования — добавить в `supabase/functions/main/index.ts` → `FUNCTION_MODULES`. Без этого Kong отдаст 404 (см. skill `self-hosted-edge-compatibility`).

## Phase 2 edge-функции

| Функция | Назначение | verify_jwt | Особенности |
|---|---|---|---|
| `softphone-call-answer` | `POST {external_call_id?, call_id?}` — ставит `answered_at = now()` | true | 3 ретрая по 2с для race condition с register; идемпотентно |
| `softphone-call-finish` | `POST {external_call_id?, call_id?, sipcode?, answered?, duration?}` — закрывает active-звонок | true | `resolveStatusCode`: **sipcode → answered param → answered_at в БД** (см. memory `architecture/unified-status-code-hierarchy`) |
| `softphone-event` | `GET ?callid=&event=&sipcode=&answered=&duration=` — единый endpoint для внешних систем | **false** | Без JWT, hard timeout 10s, ILIKE fallback для поиска. Конфиг `verify_jwt = false` в `supabase/config.toml` |

### Конфиг `softphone-event` в `supabase/config.toml`

```toml
[functions.softphone-event]
verify_jwt = false
```

> Большинство проектов на managed Supabase уже имеют `verify_jwt = false` по умолчанию из-за signing-keys. Перепроверь актуальный default для целевого проекта.

## Self-Hosted: routing

См. memory `architecture/shared-modules-edge-functions` и skill `self-hosted-edge-compatibility`. Минимум:

```ts
// supabase/functions/main/index.ts
import * as softphoneAuth from "../softphone-authenticate/index.ts";
import * as softphoneAnswer from "../softphone-call-answer/index.ts";
import * as softphoneFinish from "../softphone-call-finish/index.ts";
import * as softphoneEvent from "../softphone-event/index.ts";

export const FUNCTION_MODULES: Record<string, { handler: (req: Request) => Promise<Response> }> = {
  "softphone-authenticate": softphoneAuth,
  "softphone-call-answer":  softphoneAnswer,
  "softphone-call-finish":  softphoneFinish,
  "softphone-event":        softphoneEvent,
};
```

Каждая функция-модуль должна экспортировать `handler` и заканчиваться на `Deno.serve(handler)` — это инвариант self-hosted (см. `self-hosted-edge-compatibility/references/edge-function-shape.md`).

## Тестирование

```ts
// Аутентификация — должна вернуть токен
supabase--curl_edge_functions({
  path: "/softphone-authenticate",
  method: "POST",
  body: JSON.stringify({ login: "test_operator" })
})
```

Ожидаемо: 200 с `softphone_auth_token`, либо 500 если `ocp_proxy_url`/`ocp_proxy_api_key` не настроены — это нормально до того, как админ заполнит настройки.
