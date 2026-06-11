
CREATE TABLE public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  stream_url text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dizi','film','canli')),
  season integer,
  episode integer,
  episode_name text,
  year integer,
  thumbnail text,
  is_alive boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, stream_url)
);

CREATE INDEX media_items_kind_idx ON public.media_items(kind);
CREATE INDEX media_items_created_idx ON public.media_items(created_at DESC);

GRANT SELECT ON public.media_items TO anon, authenticated;
GRANT ALL ON public.media_items TO service_role;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read media_items" ON public.media_items FOR SELECT USING (true);

CREATE TABLE public.crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_url text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crawl_runs_created_idx ON public.crawl_runs(created_at DESC);

GRANT SELECT ON public.crawl_runs TO anon, authenticated;
GRANT ALL ON public.crawl_runs TO service_role;
ALTER TABLE public.crawl_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read crawl_runs" ON public.crawl_runs FOR SELECT USING (true);
