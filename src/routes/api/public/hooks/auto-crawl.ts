import { createFileRoute } from "@tanstack/react-router";
import { PRESET_SITES } from "@/lib/preset-sites";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const STREAM_RE = /https?:\/\/[^\s'"<>()\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s'"<>()\\]*)?/gi;
const OG_IMG_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const A_RE = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
const HINT_RE = /(dizi|film|bolum|bölüm|izle|canli|canlı|yayin|yayın|episode|watch|series)/i;

async function safeFetch(url: string, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.6",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function absUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractStreams(html: string): string[] {
  return Array.from(new Set(html.match(STREAM_RE) ?? []));
}

function extractTitle(html: string): string {
  return (html.match(TITLE_RE)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractOgImage(html: string): string | undefined {
  return html.match(OG_IMG_RE)?.[1];
}

function extractSubLinks(base: string, html: string, max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(A_RE.source, "gi");
  while ((m = rx.exec(html)) && out.length < max) {
    const href = m[1];
    const label = m[2];
    if (!HINT_RE.test(href) && !HINT_RE.test(label)) continue;
    const abs = absUrl(base, href);
    if (!abs) continue;
    if (seen.has(abs)) continue;
    // stay on same host
    try {
      if (new URL(abs).host !== new URL(base).host) continue;
    } catch {
      continue;
    }
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

type MediaRow = {
  title: string;
  kind: string;
  source_url: string;
  stream_url: string;
  thumbnail?: string | null;
};

async function crawlOne(
  site: { url: string; label: string; kind: string },
  runLog: string[],
): Promise<MediaRow[]> {
  const rows: MediaRow[] = [];
  const html = await safeFetch(site.url);
  if (!html) {
    runLog.push(`[SKIP] ${site.url} (indirilemedi)`);
    return rows;
  }
  const thumb = extractOgImage(html);
  const title = extractTitle(html) || site.label;
  const kind = site.kind === "auto" ? "dizi" : site.kind;

  for (const s of extractStreams(html)) {
    rows.push({ title, kind, source_url: site.url, stream_url: s, thumbnail: thumb ?? null });
  }

  // depth-1: follow up to 8 relevant sublinks
  const subs = extractSubLinks(site.url, html, 8);
  await Promise.all(
    subs.map(async (sub) => {
      const h = await safeFetch(sub, 8000);
      if (!h) return;
      const subTitle = extractTitle(h) || title;
      const subThumb = extractOgImage(h) ?? thumb ?? null;
      for (const s of extractStreams(h)) {
        rows.push({
          title: subTitle,
          kind,
          source_url: sub,
          stream_url: s,
          thumbnail: subThumb,
        });
      }
    }),
  );
  runLog.push(`[OK] ${site.label} → ${rows.length} akış`);
  return rows;
}

async function runAutoCrawl() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const log: string[] = [`[BAŞLA] ${new Date().toISOString()}`];

  // Merge preset + user pool
  const { data: pool } = await supabaseAdmin.from("pool_sites").select("*").eq("active", true);
  const combined = [
    ...PRESET_SITES.map((p) => ({ url: p.url, label: p.label, kind: p.kind as string })),
    ...(pool ?? []).map((p) => ({ url: p.url, label: p.label, kind: p.kind })),
  ];
  const seen = new Set<string>();
  const targets = combined.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  const { data: runRow } = await supabaseAdmin
    .from("crawl_runs")
    .insert({ root_url: `AUTO(${targets.length})`, status: "running", log: [] })
    .select()
    .single();

  const allRows: MediaRow[] = [];
  // Limit concurrency by chunks of 4
  for (let i = 0; i < targets.length; i += 4) {
    const chunk = targets.slice(i, i + 4);
    const results = await Promise.all(chunk.map((t) => crawlOne(t, log)));
    for (const r of results) allRows.push(...r);
  }

  let inserted = 0;
  if (allRows.length) {
    // Dedup by stream_url before upsert
    const byStream = new Map<string, MediaRow>();
    for (const r of allRows) if (!byStream.has(r.stream_url)) byStream.set(r.stream_url, r);
    const payload = Array.from(byStream.values());
    const { data: upserted, error } = await supabaseAdmin
      .from("media_items")
      .upsert(payload, { onConflict: "stream_url", ignoreDuplicates: false })
      .select("id");
    if (error) log.push(`[HATA] upsert: ${error.message}`);
    else inserted = upserted?.length ?? 0;
  }

  // Mark pool sites as crawled
  if (pool?.length) {
    await supabaseAdmin
      .from("pool_sites")
      .update({ last_crawled_at: new Date().toISOString() })
      .in(
        "id",
        pool.map((p) => p.id),
      );
  }

  log.push(`[BİTTİ] ${inserted} kayıt havuza yazıldı.`);
  if (runRow) {
    await supabaseAdmin
      .from("crawl_runs")
      .update({ status: "done", log, item_count: inserted })
      .eq("id", runRow.id);
  }

  return { targets: targets.length, inserted, log };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const Route = createFileRoute("/api/public/hooks/auto-crawl")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const r = await runAutoCrawl();
        return new Response(JSON.stringify(r), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
      POST: async () => {
        const r = await runAutoCrawl();
        return new Response(JSON.stringify(r), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
