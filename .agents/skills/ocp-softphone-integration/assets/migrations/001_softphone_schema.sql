-- =====================================================================
-- OCP Softphone — consolidated schema (Phase 1 + Phase 2)
-- =====================================================================
-- Эта миграция консолидирует ~34 инкрементальных миграций из проекта
-- ocpcrm в одну "финальную форму". Применяется идемпотентно (IF NOT
-- EXISTS / DO $$ ... $$ блоки) — безопасно запускать на пустой базе и
-- на базе с уже существующими частями схемы.
--
-- Требования:
--   • Таблица public.profiles (id uuid PK ссылается на auth.users.id)
--   • Функция public.has_role(uuid, app_role) — паттерн user_roles
--     (см. секцию <user-roles> в системном промпте)
--   • Для Phase 2 — таблица public.calls (если её нет — Phase 2 не
--     разворачивать, см. SKILL.md «Обязательный пре-шаг»)
--
-- Self-Hosted: после применения выполнить
--   docker exec supabase-rest pkill -SIGUSR1 postgrest
-- чтобы PostgREST подхватил новую RPC get_softphone_settings.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Утилитарная функция updated_at (если ещё нет в проекте)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


-- ---------------------------------------------------------------------
-- 1. profiles.telephony_login  (логин оператора в OCP)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telephony_login TEXT;


-- ---------------------------------------------------------------------
-- 2. softphone_settings — singleton (одна строка на проект)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.softphone_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled               BOOLEAN DEFAULT true,

  -- OCP-прокси
  ocp_domain            TEXT NOT NULL DEFAULT 'example.service-desk.site',
  ocp_proxy_url         TEXT NOT NULL DEFAULT 'https://cdn2.service-desk.site',
  ocp_proxy_api_key     TEXT,

  -- Поведение
  auto_connect          BOOLEAN DEFAULT false,
  acw_auto_ready        BOOLEAN DEFAULT false,
  acw_auto_ready_mode   TEXT DEFAULT 'off'
    CHECK (acw_auto_ready_mode IN ('off','on_card_close','on_call_end','always')),
  click_to_call_mode    TEXT NOT NULL DEFAULT 'browser'
    CHECK (click_to_call_mode IN ('browser','softphone')),

  -- Позиционирование
  position_anchor       TEXT NOT NULL DEFAULT 'top-right'
    CHECK (position_anchor IN ('top-right','top-left','bottom-right','bottom-left')),
  top_offset            INTEGER NOT NULL DEFAULT 60,
  right_offset          INTEGER NOT NULL DEFAULT 320,
  fixed_to_header       BOOLEAN DEFAULT false,

  -- События открытия/закрытия карточки (валидные ID — см. references/strategies.md)
  open_card_events      TEXT[] DEFAULT ARRAY[
    'incomingCallProgress',
    'outgoingCallProgress',
    'OCPincomingCallProgress'
  ],
  close_card_events     TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GRANTs (RLS ограничивает до admin)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.softphone_settings TO authenticated;
GRANT ALL ON public.softphone_settings TO service_role;

-- RLS
ALTER TABLE public.softphone_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='softphone_settings'
      AND policyname='Admins manage softphone_settings') THEN
    CREATE POLICY "Admins manage softphone_settings"
      ON public.softphone_settings FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='softphone_settings'
      AND policyname='Authenticated can view softphone_settings') THEN
    CREATE POLICY "Authenticated can view softphone_settings"
      ON public.softphone_settings FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Singleton: схлопнуть дубликаты + уникальный индекс на ((true))
WITH keep AS (
  SELECT id FROM public.softphone_settings ORDER BY created_at, id LIMIT 1
)
DELETE FROM public.softphone_settings WHERE id NOT IN (SELECT id FROM keep);

CREATE UNIQUE INDEX IF NOT EXISTS softphone_settings_singleton
  ON public.softphone_settings ((true));

-- Seed: гарантируем хотя бы одну строку
INSERT INTO public.softphone_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.softphone_settings);

-- updated_at trigger
DROP TRIGGER IF EXISTS softphone_settings_updated_at ON public.softphone_settings;
CREATE TRIGGER softphone_settings_updated_at
  BEFORE UPDATE ON public.softphone_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------
-- 3. RPC get_softphone_settings — единая точка чтения для виджета
--    (скрывает ocp_proxy_api_key от не-админов)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_softphone_settings();

CREATE OR REPLACE FUNCTION public.get_softphone_settings()
RETURNS TABLE (
  id                    UUID,
  enabled               BOOLEAN,
  top_offset            INTEGER,
  right_offset          INTEGER,
  fixed_to_header       BOOLEAN,
  ocp_domain            TEXT,
  ocp_proxy_api_key     TEXT,
  ocp_proxy_url         TEXT,
  auto_connect          BOOLEAN,
  open_card_events      TEXT[],
  close_card_events     TEXT[],
  position_anchor       TEXT,
  click_to_call_mode    TEXT,
  acw_auto_ready        BOOLEAN,
  acw_auto_ready_mode   TEXT,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    COALESCE(s.enabled, true),
    s.top_offset, s.right_offset, s.fixed_to_header,
    s.ocp_domain,
    CASE WHEN public.has_role(auth.uid(), 'admin'::public.app_role)
         THEN s.ocp_proxy_api_key ELSE NULL END,
    s.ocp_proxy_url,
    s.auto_connect,
    s.open_card_events, s.close_card_events,
    s.position_anchor, s.click_to_call_mode,
    COALESCE(s.acw_auto_ready, false),
    COALESCE(s.acw_auto_ready_mode, 'off'),
    s.created_at, s.updated_at
  FROM public.softphone_settings s
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_softphone_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_softphone_settings()
  TO authenticated, service_role;


-- =====================================================================
-- PHASE 2 — Screen Pop (раскомментировать только если в проекте есть
-- public.calls и нужна карточка входящего звонка)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4. calls.screen_pop_* (lifecycle карточки — для аналитики)
--    Требует существующей public.calls
-- ---------------------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS screen_pop_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS screen_pop_closed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.calls.screen_pop_opened_at IS
  'Когда screen pop карточка открылась у оператора';
COMMENT ON COLUMN public.calls.screen_pop_closed_at IS
  'Когда оператор закрыл screen pop карточку';

-- Realtime для calls (нужно для пуша звонков виджету)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 5. call_screen_pop_configs — конфиги карточки
--    call_directions: 1=исходящий, 2=входящий, 3=входящий с переадресацией,
--                     4=обратный звонок (см. public.calls.call_type)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_screen_pop_configs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  description             TEXT,
  is_active               BOOLEAN DEFAULT true,
  is_default              BOOLEAN DEFAULT false,

  -- Условия матчинга
  call_directions         INTEGER[] DEFAULT '{1,2}',

  -- Дерево результатов звонка
  call_result_tree_id     UUID,  -- FK на call_result_trees, если она есть в проекте
  show_call_result        BOOLEAN DEFAULT true,
  call_result_required    BOOLEAN DEFAULT false,
  call_result_multiple    BOOLEAN DEFAULT false,

  -- Какие поля показывать (массивы field codes)
  contact_fields          JSONB DEFAULT '["first_name","last_name","phones","emails","position"]'::jsonb,
  company_fields          JSONB DEFAULT '["name","industry","phones"]'::jsonb,
  deal_fields             JSONB DEFAULT '["title","opportunity","stage_id"]'::jsonb,
  user_fields             JSONB DEFAULT '["first_name","last_name","avatar_url"]'::jsonb,

  -- Тумблеры секций
  show_contact            BOOLEAN DEFAULT true,
  show_company            BOOLEAN DEFAULT true,
  show_deals              BOOLEAN DEFAULT true,
  show_call_history       BOOLEAN DEFAULT true,
  show_sms                BOOLEAN DEFAULT false,

  -- Порядок и колоночность секций
  sections_order          TEXT[] DEFAULT ARRAY[
    'contact','company','deals','user','call_history','call_result'
  ],
  section_columns         JSONB DEFAULT '{"contact":1,"company":1,"deals":1,"user":1}'::jsonb,

  -- Кастомные элементы (iframe, кнопки, JS-блоки)
  custom_elements         JSONB DEFAULT '[]'::jsonb,

  -- UI
  position                TEXT DEFAULT 'center'
    CHECK (position IN ('center','left','right')),
  width                   INTEGER DEFAULT 420,
  height                  INTEGER DEFAULT 0,  -- 0 = auto
  is_resizable            BOOLEAN DEFAULT true,
  is_minimizable          BOOLEAN DEFAULT true,

  created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_screen_pop_configs TO authenticated;
GRANT ALL ON public.call_screen_pop_configs TO service_role;

ALTER TABLE public.call_screen_pop_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='call_screen_pop_configs'
      AND policyname='Authenticated read call_screen_pop_configs') THEN
    CREATE POLICY "Authenticated read call_screen_pop_configs"
      ON public.call_screen_pop_configs FOR SELECT
      TO authenticated USING (is_active = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='call_screen_pop_configs'
      AND policyname='Admins manage call_screen_pop_configs') THEN
    CREATE POLICY "Admins manage call_screen_pop_configs"
      ON public.call_screen_pop_configs FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_call_screen_pop_configs_updated_at
  ON public.call_screen_pop_configs;
CREATE TRIGGER update_call_screen_pop_configs_updated_at
  BEFORE UPDATE ON public.call_screen_pop_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: одна дефолтная карточка — иначе виджет не откроет screen pop ни для одного звонка
INSERT INTO public.call_screen_pop_configs (name, description, is_default, call_directions)
SELECT 'Карточка по умолчанию',
       'Стандартная карточка для входящих и исходящих звонков',
       true, '{1,2}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.call_screen_pop_configs WHERE is_default = true
);


-- ---------------------------------------------------------------------
-- 6. user_screen_pop_settings — пер-пользовательские overrides (position/size)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_screen_pop_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  config_id       UUID NOT NULL REFERENCES public.call_screen_pop_configs(id) ON DELETE CASCADE,

  position        TEXT CHECK (position IS NULL OR position IN ('center','left','right')),
  width           INTEGER,
  height          INTEGER,
  is_minimized    BOOLEAN DEFAULT false,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, config_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_screen_pop_settings TO authenticated;
GRANT ALL ON public.user_screen_pop_settings TO service_role;

ALTER TABLE public.user_screen_pop_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_screen_pop_settings'
      AND policyname='Users can manage own settings') THEN
    CREATE POLICY "Users can manage own settings"
      ON public.user_screen_pop_settings FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_screen_pop_settings_updated_at
  ON public.user_screen_pop_settings;
CREATE TRIGGER update_user_screen_pop_settings_updated_at
  BEFORE UPDATE ON public.user_screen_pop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();