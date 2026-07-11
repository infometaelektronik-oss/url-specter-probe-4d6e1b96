
-- 1) Autonomous streams
CREATE TABLE IF NOT EXISTS public.autonomous_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  normalized_title TEXT,
  type TEXT NOT NULL DEFAULT 'live_tv',   -- live_tv | movie | series | radio
  category TEXT,                           -- Spor, Belgesel, Ulusal, Sinema, Dizi, Radyo, Diger
  stream_url TEXT NOT NULL,
  poster_image_url TEXT,
  resolution TEXT,                         -- 1080p | 720p | 480p | unknown
  source TEXT,                             -- kaynak site host
  source_website TEXT,                     -- ham kaynak URL
  custom_headers JSONB DEFAULT '{}'::jsonb,-- referer/origin/user-agent
  failover_group TEXT,                     -- aynı içeriğin alternatifleri
  status TEXT NOT NULL DEFAULT 'active',   -- active | inactive | pending
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  last_pushed_at TIMESTAMPTZ,
  choicely_id TEXT,                        -- Choicely'e push edilince dönen id
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS autonomous_streams_stream_url_key
  ON public.autonomous_streams(stream_url);
CREATE INDEX IF NOT EXISTS autonomous_streams_status_idx
  ON public.autonomous_streams(status);
CREATE INDEX IF NOT EXISTS autonomous_streams_category_idx
  ON public.autonomous_streams(category);
CREATE INDEX IF NOT EXISTS autonomous_streams_type_idx
  ON public.autonomous_streams(type);
CREATE INDEX IF NOT EXISTS autonomous_streams_failover_idx
  ON public.autonomous_streams(failover_group);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomous_streams TO anon, authenticated;
GRANT ALL ON public.autonomous_streams TO service_role;

ALTER TABLE public.autonomous_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read autonomous_streams" ON public.autonomous_streams FOR SELECT USING (true);
CREATE POLICY "public insert autonomous_streams" ON public.autonomous_streams FOR INSERT WITH CHECK (true);
CREATE POLICY "public update autonomous_streams" ON public.autonomous_streams FOR UPDATE USING (true);
CREATE POLICY "public delete autonomous_streams" ON public.autonomous_streams FOR DELETE USING (true);

-- 2) Discovery queries (dorks + osint kaynakları)
CREATE TABLE IF NOT EXISTS public.discovery_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'duckduckgo', -- duckduckgo | github | pastebin | direct
  active BOOLEAN NOT NULL DEFAULT true,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_queries_unique
  ON public.discovery_queries(engine, query);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_queries TO anon, authenticated;
GRANT ALL ON public.discovery_queries TO service_role;
ALTER TABLE public.discovery_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw discovery_queries all" ON public.discovery_queries FOR ALL USING (true) WITH CHECK (true);

-- 3) Live scraper log
CREATE TABLE IF NOT EXISTS public.scraper_logs (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info',      -- info | ok | warn | error
  phase TEXT NOT NULL,                     -- discover | extract | validate | push | health
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scraper_logs_created_idx ON public.scraper_logs(created_at DESC);

GRANT SELECT, INSERT ON public.scraper_logs TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.scraper_logs_id_seq TO anon, authenticated;
GRANT ALL ON public.scraper_logs TO service_role;
GRANT ALL ON SEQUENCE public.scraper_logs_id_seq TO service_role;

ALTER TABLE public.scraper_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read scraper_logs" ON public.scraper_logs FOR SELECT USING (true);
CREATE POLICY "public insert scraper_logs" ON public.scraper_logs FOR INSERT WITH CHECK (true);

-- 4) Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_autonomous_streams_updated_at ON public.autonomous_streams;
CREATE TRIGGER update_autonomous_streams_updated_at
  BEFORE UPDATE ON public.autonomous_streams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Seed default dorks (60+ query)
INSERT INTO public.discovery_queries (query, engine) VALUES
  ('inurl:playlist.m3u8', 'duckduckgo'),
  ('inurl:stream.m3u8 tv', 'duckduckgo'),
  ('"index of" m3u8', 'duckduckgo'),
  ('"index of" m3u iptv', 'duckduckgo'),
  ('intitle:"iptv playlist" m3u', 'duckduckgo'),
  ('filetype:m3u iptv turkey', 'duckduckgo'),
  ('filetype:m3u8 turkiye', 'duckduckgo'),
  ('inurl:m3u8 kanal d', 'duckduckgo'),
  ('inurl:m3u8 star tv', 'duckduckgo'),
  ('inurl:m3u8 atv canli', 'duckduckgo'),
  ('inurl:m3u8 show tv', 'duckduckgo'),
  ('inurl:m3u8 tv8 canli', 'duckduckgo'),
  ('inurl:m3u8 trt 1 canli', 'duckduckgo'),
  ('inurl:m3u8 now tv fox', 'duckduckgo'),
  ('inurl:m3u8 bein sport', 'duckduckgo'),
  ('inurl:m3u8 tivibu spor', 'duckduckgo'),
  ('inurl:m3u8 s sport', 'duckduckgo'),
  ('"kanal d" canli izle m3u8', 'duckduckgo'),
  ('"star tv" canli izle m3u8', 'duckduckgo'),
  ('"atv canli" m3u8', 'duckduckgo'),
  ('hdfilmcehennemi guncel', 'duckduckgo'),
  ('fullhdfilmizlesene guncel dizi', 'duckduckgo'),
  ('dizibox guncel bolum m3u8', 'duckduckgo'),
  ('dizipal guncel m3u8', 'duckduckgo'),
  ('sinemazenger m3u8', 'duckduckgo'),
  ('turk dizileri canli m3u8', 'duckduckgo'),
  ('iptv m3u turkey 2026', 'github'),
  ('turkiye iptv m3u playlist', 'github'),
  ('turkish iptv m3u8', 'github'),
  ('iptv playlist tr', 'github'),
  ('kanal d m3u8', 'github'),
  ('star tv m3u8 stream', 'github'),
  ('atv canli m3u8', 'github'),
  ('show tv m3u8', 'github'),
  ('tv8 m3u8', 'github'),
  ('trt m3u8', 'github'),
  ('now tv fox m3u8', 'github'),
  ('bein sport m3u8 turkey', 'github'),
  ('spor m3u8 turkiye', 'github'),
  ('turkish live tv m3u', 'github')
ON CONFLICT DO NOTHING;
