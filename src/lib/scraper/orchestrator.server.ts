// Core engine: discover -> enqueue -> parallel workers -> deep extract -> validate -> classify -> store -> feed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToChoicely, deactivateOnChoicely } from "./choicely.server";
import { searchDuckDuckGo, searchGitHub, scanPastebinTrends } from "./discovery.server";
import { smartFetch, pooled, telemetry } from "./fetch.server";
import { classifyContent } from "./nlp.server";
import { normKey } from "./epg.server";
import { notify } from "./webhooks.server";
import {
  cleanTitle, deepExtract, extractIframes, extractScripts, guessCategory, guessType,
  META_DESC_RE, OG_IMAGE_RE, TITLE_RE,
} from "./regex.server";
import { validateStream } from "./validate.server";

type LogRow = { level: "info" | "ok" | "warn" | "error"; phase: string; message: string; meta?: Record<string, string | number | boolean | null> };

async function log(rows: LogRow[]) {
  if (!rows.length) return;
  await supabaseAdmin.from("scraper_logs").insert(rows.map((r) => ({ ...r, meta: (r.meta ?? {}) as never })));
}

const CONCURRENCY = 6; // worker runtime allows 6 outbound connections per invocation

export type DiscoverySummary = {
  queries: number; enqueued: number; pages: number; candidates: number;
  validated: number; inserted: number; updated: number; pushed: number; logs: LogRow[];
};

/** Phase A — find candidate pages and push them into the shared job queue. */
export async function runDiscovery(opts: { manual?: boolean } = {}): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = { queries: 0, enqueued: 0, pages: 0, candidates: 0, validated: 0, inserted: 0, updated: 0, pushed: 0, logs: [] };
  const buffer: LogRow[] = [];
  const push = (r: LogRow) => { buffer.push(r); summary.logs.push(r); };

  push({ level: "info", phase: "discover", message: `Keşif turu başladı${opts.manual ? " (manuel)" : ""}` });

  const { data: queries } = await supabaseAdmin
    .from("discovery_queries").select("*").eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true }).limit(12);

  const list = queries ?? [];
  summary.queries = list.length;
  const candidates = new Set<string>();

  await pooled(list, CONCURRENCY, async (q) => {
    let hits: string[] = [];
    try {
      if (q.engine === "duckduckgo") hits = await searchDuckDuckGo(q.query, 15);
      else if (q.engine === "github") hits = await searchGitHub(q.query, 10);
    } catch { /* ignore */ }
    hits.forEach((h) => candidates.add(h));
    push({ level: hits.length ? "ok" : "warn", phase: "discover", message: `${q.engine}: "${q.query}" → ${hits.length}` });
    await supabaseAdmin.from("discovery_queries")
      .update({ last_run_at: new Date().toISOString(), hit_count: (q.hit_count ?? 0) + hits.length }).eq("id", q.id);
  });

  try {
    (await scanPastebinTrends()).forEach((p) => candidates.add(p));
  } catch { /* ignore */ }

  // Always-available public playlist seeds (search engines often block worker IPs)
  for (const c of ["tr", "us", "uk", "de", "fr", "az"]) candidates.add(`https://iptv-org.github.io/iptv/countries/${c}.m3u`);
  for (const c of ["news", "sports", "movies", "music", "kids", "entertainment"]) candidates.add(`https://iptv-org.github.io/iptv/categories/${c}.m3u`);

  // crawl_jobs only has a partial unique index, so dedupe manually instead of upsert.
  const urls = Array.from(candidates).slice(0, 200);
  if (urls.length) {
    const since = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: seen } = await supabaseAdmin.from("crawl_jobs").select("url").in("url", urls).or(`status.in.(queued,running),created_at.gte.${since}`);
    const skip = new Set((seen ?? []).map((r) => r.url));
    const rows = urls.filter((u) => !skip.has(u)).map((url) => ({ url, depth: 0 }));
    if (rows.length) {
      const { data: ins, error } = await supabaseAdmin.from("crawl_jobs").insert(rows).select("id");
      if (error) push({ level: "error", phase: "discover", message: `Kuyruğa yazılamadı: ${error.message}` });
      summary.enqueued = ins?.length ?? 0;
    }
  }
  push({ level: "ok", phase: "discover", message: `${summary.enqueued} yeni görev kuyruğa alındı` });
  await log(buffer);

  // immediately process a first batch so manual runs show results right away
  const worked = await runWorker({ batch: 8 });
  summary.pages = worked.pages;
  summary.candidates = worked.candidates;
  summary.validated = worked.validated;
  summary.inserted = worked.inserted;
  summary.updated = worked.updated;
  summary.pushed = worked.pushed;
  summary.logs.push(...worked.logs);
  return summary;
}

export type WorkerSummary = { pages: number; candidates: number; validated: number; inserted: number; updated: number; pushed: number; logs: LogRow[] };

/** Phase B — claim jobs from the queue and process them in parallel. */
export async function runWorker(opts: { batch?: number } = {}): Promise<WorkerSummary> {
  telemetry.reset();
  const s: WorkerSummary = { pages: 0, candidates: 0, validated: 0, inserted: 0, updated: 0, pushed: 0, logs: [] };
  const buffer: LogRow[] = [];
  const push = (r: LogRow) => { buffer.push(r); s.logs.push(r); };

  const { data: jobs } = await supabaseAdmin.rpc("claim_jobs", { _n: opts.batch ?? 6 });
  if (!jobs?.length) {
    await log([{ level: "info", phase: "worker", message: "Kuyruk boş" }]);
    return s;
  }

  await pooled(jobs, CONCURRENCY, async (job) => {
    try {
      const res = await smartFetch(job.url, { timeoutMs: 12000, referer: job.referer ?? undefined, attempts: 3 });
      if (!res.text) {
        await supabaseAdmin.from("crawl_jobs").update({ status: "failed", error: `status ${res.status}`, finished_at: new Date().toISOString() }).eq("id", job.id);
        push({ level: "warn", phase: "fetch", message: `${job.url.slice(0, 70)} → ${res.status}${res.blocked ? " (engellendi)" : ""}` });
        return;
      }
      s.pages += 1;

      const streams = new Set(deepExtract(res.text, job.url));

      // one level deeper: iframes + external scripts (heuristic adaptation)
      if (job.depth < 2) {
        const deeper = [...extractIframes(res.text, job.url).slice(0, 3), ...extractScripts(res.text, job.url).filter((u) => /player|embed|stream|hls|config|app|main/i.test(u)).slice(0, 4)];
        await pooled(deeper, 4, async (u) => {
          const r2 = await smartFetch(u, { timeoutMs: 9000, referer: job.url, attempts: 2 });
          if (r2.text) deepExtract(r2.text, u).forEach((x) => streams.add(x));
        });
      }

      const unique = Array.from(streams).slice(0, /\.m3u($|\?)/i.test(job.url) ? 40 : 12);
      s.candidates += unique.length;
      const title = res.text.match(TITLE_RE)?.[1] ?? "";
      const desc = res.text.match(META_DESC_RE)?.[1] ?? "";
      const poster = res.text.match(OG_IMAGE_RE)?.[1] ?? null;
      const host = (() => { try { return new URL(job.url).host; } catch { return "unknown"; } })();
      if (unique.length) push({ level: "info", phase: "extract", message: `${host} → ${unique.length} aday akış` });

      await pooled(unique, 3, async (stream) => {
        const v = await validateStream(stream, job.url);
        if (!v.ok || (!v.isVideo && v.qualityTier !== "AUDIO")) return;
        s.validated += 1;

        const ai = await classifyContent({ title, description: desc, sourceUrl: job.url, streamUrl: stream });
        const finalTitle = ai?.title || cleanTitle(title);
        const category = ai?.category || guessCategory(`${title} ${desc} ${stream}`);
        const type = ai?.type || guessType(`${title} ${stream}`);

        const row = {
          title: finalTitle, normalized_title: normKey(finalTitle), type,
          category: v.geoBlocked ? `${category} (GEO)` : category,
          stream_url: stream, poster_image_url: poster,
          resolution: v.resolution !== "unknown" ? v.resolution : (ai?.quality ?? "unknown"),
          quality_tier: v.qualityTier, bitrate_kbps: v.bitrateKbps, variants: v.variants as never,
          response_ms: v.responseMs, geo_country: v.geoCountry,
          priority: v.qualityTier === "FHD" ? 30 : v.qualityTier === "HD" ? 20 : 10,
          source: host, source_website: job.url, custom_headers: v.customHeaders as never,
          failover_group: normKey(finalTitle), status: "active", failure_count: 0,
          last_checked_at: new Date().toISOString(), is_active: true,
        };

        const { data: existing } = await supabaseAdmin.from("autonomous_streams").select("id").eq("stream_url", stream).maybeSingle();
        if (existing) {
          await supabaseAdmin.from("autonomous_streams").update({ ...row, updated_at: new Date().toISOString() } as never).eq("id", existing.id);
          s.updated += 1;
        } else {
          await supabaseAdmin.from("autonomous_streams").insert(row as never);
          s.inserted += 1;
          push({ level: "ok", phase: "extract", message: `+ ${finalTitle} [${v.qualityTier} ${v.resolution}]` });
        }

        const cp = await pushToChoicely({
          title: finalTitle, type, source: host, category, poster_image_url: poster,
          video_stream_url: stream, is_active: true, custom_headers: v.customHeaders, resolution: row.resolution,
        });
        if (cp.ok) {
          s.pushed += 1;
          await supabaseAdmin.from("autonomous_streams")
            .update({ last_pushed_at: new Date().toISOString(), ...(cp.id ? { choicely_id: cp.id } : {}) } as never)
            .eq("stream_url", stream);
        }
      });

      await supabaseAdmin.from("crawl_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
    } catch (e) {
      await supabaseAdmin.from("crawl_jobs").update({ status: "failed", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("id", job.id);
      push({ level: "error", phase: "worker", message: `${job.url.slice(0, 60)}: ${(e as Error).message}` });
    }
  });

  const t = telemetry.snapshot();
  await supabaseAdmin.from("engine_metrics").insert({ kind: "worker", ...t, found: s.inserted });
  push({ level: "info", phase: "worker", message: `Tur bitti — ${s.inserted} yeni, ${s.updated} güncel, ${t.banned} engel, ort. ${t.avg_ms}ms` });
  if (s.inserted > 0) await notify("new_source", "Yeni akışlar bulundu", `${s.inserted} yeni akış eklendi (${s.pages} sayfa tarandı).`);
  await log(buffer);
  return s;
}

export type HealthSummary = { checked: number; killed: number; restored: number; removedFromChoicely: number };

export async function runHealthCheck(): Promise<HealthSummary> {
  telemetry.reset();
  const summary: HealthSummary = { checked: 0, killed: 0, restored: 0, removedFromChoicely: 0 };
  const { data: rows } = await supabaseAdmin
    .from("autonomous_streams")
    .select("id, title, stream_url, failure_count, status, choicely_id, source_website, geo_country")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(36);
  const buffer: LogRow[] = [{ level: "info", phase: "health", message: `Sağlık taraması: ${rows?.length ?? 0} akış` }];
  const dead: string[] = [];

  await pooled(rows ?? [], CONCURRENCY, async (row) => {
    summary.checked += 1;
    const v = await validateStream(row.stream_url, row.source_website ?? undefined, row.geo_country ?? undefined);
    const now = new Date().toISOString();
    if (v.ok && (v.isVideo || v.qualityTier === "AUDIO")) {
      await supabaseAdmin.from("autonomous_streams").update({
        failure_count: 0, status: "active", is_active: true, last_checked_at: now,
        quality_tier: v.qualityTier, bitrate_kbps: v.bitrateKbps, variants: v.variants as never, response_ms: v.responseMs,
      } as never).eq("id", row.id);
      if (row.status !== "active") summary.restored += 1;
    } else {
      const nextFail = (row.failure_count ?? 0) + 1;
      const kill = nextFail >= 3;
      await supabaseAdmin.from("autonomous_streams")
        .update({ failure_count: nextFail, status: kill ? "inactive" : row.status, is_active: !kill, last_checked_at: now } as never)
        .eq("id", row.id);
      if (kill) {
        summary.killed += 1;
        dead.push(row.title);
        buffer.push({ level: "warn", phase: "health", message: `× ölü: ${row.title}` });
        if ((await deactivateOnChoicely(row.choicely_id, row.stream_url)).ok) summary.removedFromChoicely += 1;
      }
    }
  });

  const t = telemetry.snapshot();
  await supabaseAdmin.from("engine_metrics").insert({ kind: "health", ...t, found: summary.restored });
  buffer.push({ level: "ok", phase: "health", message: `Health — ${summary.killed} elendi, ${summary.restored} geri döndü` });
  if (dead.length) await notify("stream_down", "Yayın koptu", dead.slice(0, 20).join("\n"));
  await log(buffer);
  return summary;
}
