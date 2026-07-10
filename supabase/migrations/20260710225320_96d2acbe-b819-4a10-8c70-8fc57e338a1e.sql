
-- Cleanup dupes first
DELETE FROM public.media_items a USING public.media_items b
WHERE a.id > b.id AND a.stream_url = b.stream_url;

CREATE TABLE IF NOT EXISTS public.pool_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'auto',
  active boolean NOT NULL DEFAULT true,
  last_crawled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_sites TO anon, authenticated;
GRANT ALL ON public.pool_sites TO service_role;
ALTER TABLE public.pool_sites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public pool_sites read" ON public.pool_sites FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public pool_sites insert" ON public.pool_sites FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public pool_sites update" ON public.pool_sites FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public pool_sites delete" ON public.pool_sites FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public media_items insert" ON public.media_items FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public media_items update" ON public.media_items FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT INSERT, UPDATE, DELETE ON public.media_items TO anon, authenticated;

DO $$ BEGIN
  CREATE POLICY "public crawl_runs insert" ON public.crawl_runs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public crawl_runs update" ON public.crawl_runs FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT INSERT, UPDATE, DELETE ON public.crawl_runs TO anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS media_items_stream_unique ON public.media_items (stream_url);
