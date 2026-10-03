-- Roles
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- First signed-in user may claim admin while no admin exists
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN public.has_role(auth.uid(), 'admin');
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

-- Settings (internal tokens, captcha provider, etc.)
CREATE TABLE IF NOT EXISTS public.engine_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_settings TO authenticated;
GRANT ALL ON public.engine_settings TO service_role;
ALTER TABLE public.engine_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all settings" ON public.engine_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.engine_settings(key, value) VALUES
  ('cron_token', to_jsonb(encode(gen_random_bytes(24),'hex'))),
  ('captcha', '{"provider":"2captcha"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Proxy pool (gateway-style URL templates: {url} and optional {country})
CREATE TABLE IF NOT EXISTS public.proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  template text NOT NULL,
  country text,
  kind text NOT NULL DEFAULT 'residential',
  active boolean NOT NULL DEFAULT true,
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  ban_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proxies TO authenticated;
GRANT ALL ON public.proxies TO service_role;
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all proxies" ON public.proxies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- API clients for external IPTV systems
CREATE TABLE IF NOT EXISTS public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  ip_whitelist text[] NOT NULL DEFAULT '{}',
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  request_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all api_clients" ON public.api_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.api_rate_buckets (
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, window_start)
);
GRANT ALL ON public.api_rate_buckets TO service_role;
ALTER TABLE public.api_rate_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.api_hit(_client uuid, _limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w timestamptz := date_trunc('minute', now()); n integer;
BEGIN
  INSERT INTO public.api_rate_buckets(client_id, window_start, hits) VALUES (_client, w, 1)
  ON CONFLICT (client_id, window_start) DO UPDATE SET hits = api_rate_buckets.hits + 1
  RETURNING hits INTO n;
  UPDATE public.api_clients SET request_count = request_count + 1, last_used_at = now() WHERE id = _client;
  DELETE FROM public.api_rate_buckets WHERE window_start < now() - interval '10 minutes';
  RETURN n <= _limit;
END $$;
REVOKE ALL ON FUNCTION public.api_hit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_hit(uuid, integer) TO service_role;

-- Webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'generic',
  url text NOT NULL,
  telegram_chat_id text,
  events text[] NOT NULL DEFAULT '{stream_down,new_source,run_failed}',
  active boolean NOT NULL DEFAULT true,
  last_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all webhooks" ON public.webhooks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Job queue
CREATE TABLE IF NOT EXISTS public.crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  referer text,
  depth integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  locked_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_jobs_url_open ON public.crawl_jobs(url) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS crawl_jobs_status_idx ON public.crawl_jobs(status, created_at);
GRANT SELECT ON public.crawl_jobs TO authenticated;
GRANT ALL ON public.crawl_jobs TO service_role;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read jobs" ON public.crawl_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.claim_jobs(_n integer)
RETURNS SETOF public.crawl_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crawl_jobs SET status='queued', locked_at=NULL
   WHERE status='running' AND locked_at < now() - interval '5 minutes';
  RETURN QUERY
  UPDATE public.crawl_jobs j SET status='running', locked_at=now(), attempts=j.attempts+1
  WHERE j.id IN (
    SELECT id FROM public.crawl_jobs WHERE status='queued'
    ORDER BY depth, created_at FOR UPDATE SKIP LOCKED LIMIT _n
  ) RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(integer) TO service_role;

-- EPG
CREATE TABLE IF NOT EXISTS public.epg_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  program_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epg_sources TO authenticated;
GRANT ALL ON public.epg_sources TO service_role;
ALTER TABLE public.epg_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all epg_sources" ON public.epg_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.epg_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_key text NOT NULL,
  channel_name text,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  stop_at timestamptz NOT NULL,
  UNIQUE (channel_key, start_at)
);
CREATE INDEX IF NOT EXISTS epg_programs_time ON public.epg_programs(stop_at);
GRANT SELECT ON public.epg_programs TO authenticated;
GRANT ALL ON public.epg_programs TO service_role;
ALTER TABLE public.epg_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read epg" ON public.epg_programs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Telemetry
CREATE TABLE IF NOT EXISTS public.engine_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  success integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  banned integer NOT NULL DEFAULT 0,
  avg_ms integer NOT NULL DEFAULT 0,
  found integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS engine_metrics_ts ON public.engine_metrics(ts DESC);
GRANT SELECT ON public.engine_metrics TO authenticated;
GRANT ALL ON public.engine_metrics TO service_role;
ALTER TABLE public.engine_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read metrics" ON public.engine_metrics FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Feed cache
CREATE TABLE IF NOT EXISTS public.feed_cache (
  key text PRIMARY KEY,
  body text NOT NULL,
  content_type text NOT NULL,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.feed_cache TO service_role;
ALTER TABLE public.feed_cache ENABLE ROW LEVEL SECURITY;

-- Stream quality / failover columns
ALTER TABLE public.autonomous_streams
  ADD COLUMN IF NOT EXISTS bitrate_kbps integer,
  ADD COLUMN IF NOT EXISTS quality_tier text,
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS response_ms integer,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geo_country text;

GRANT SELECT, UPDATE, DELETE ON public.autonomous_streams TO authenticated;
GRANT SELECT ON public.scraper_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_queries TO authenticated;
CREATE POLICY "admin read streams" ON public.autonomous_streams FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update streams" ON public.autonomous_streams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete streams" ON public.autonomous_streams FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin read logs" ON public.scraper_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all queries" ON public.discovery_queries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
