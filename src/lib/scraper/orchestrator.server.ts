// Otonom orchestrator — discover → extract → validate → classify → dedupe → Choicely push
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToChoicely, deactivateOnChoicely } from "./choicely.server";
import { searchDuckDuckGo, searchGitHub, scanPastebinTrends } from "./discovery.server";
import { classifyContent } from "./nlp.server";
import {
  cleanTitle,
  extractIframes,
  extractStreamUrls,
  guessCategory,
  guessType,
  META_DESC_RE,
  OG_IMAGE_RE,
  TITLE_RE,
} from "./regex.server";
import { safeFetch } from "./user-agents";
import { validateStream } from "./validate.server";

type LogRow = { level: "info" | "ok" | "warn" | "error"; phase: string; message: string; meta?: Record<string, unknown> };

async function log(rows: LogRow[]) {
  if (!rows.length) return;
  await supabaseAdmin
    .from("scraper_logs")
    .insert(rows.map((r) => ({ ...r, meta: (r.meta ?? {}) as never })));
}

const HOST_LIMIT_PER_RUN = 30;
const STREAMS_PER_PAGE = 8;

export type DiscoverySummary = {
  queries: number;
  pages: number;
  candidates: number;
  validated: number;
  inserted: number;
  updated: number;
  pushed: number;
  logs: LogRow[];
};

export async function runDiscovery(opts: { manual?: boolean } = {}): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    queries: 0,
    pages: 0,
    candidates: 0,
    validated: 0,
    inserted: 0,
    updated: 0,
    pushed: 0,
    logs: [],
  };
  const buffer: LogRow[] = [];
  const push = (r: LogRow) => {
    buffer.push(r);
    summary.logs.push(r);
    if (buffer.length >= 20) {
      void log(buffer.splice(0, buffer.length));
    }
  };

  push({ level: "info", phase: "discover", message: `Otonom tarama başladı${opts.manual ? " (manuel)" : ""}` });

  // 1) Query havuzu — DB'den aktif sorguları çek
  const { data: queries } = await supabaseAdmin
    .from("discovery_queries")
    .select("*")
    .eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(12);

  const queryList = queries ?? [];
  summary.queries = queryList.length;

  // 2) Aday sayfalar topla
  const candidatePages = new Set<string>();
  for (const q of queryList) {
    let hits: string[] = [];
    try {
      if (q.engine === "duckduckgo") hits = await searchDuckDuckGo(q.query, 12);
      else if (q.engine === "github") hits = await searchGitHub(q.query, 8);
    } catch {
      /* ignore */
    }
    push({ level: hits.length ? "ok" : "warn", phase: "discover", message: `${q.engine}: "${q.query}" → ${hits.length} sayfa` });
    hits.forEach((h) => candidatePages.add(h));
    await supabaseAdmin
      .from("discovery_queries")
      .update({ last_run_at: new Date().toISOString(), hit_count: (q.hit_count ?? 0) + hits.length })
      .eq("id", q.id);
  }

  // 3) Pastebin trend (OSINT — 6 saatte bir mantığı için opts.manual olmasa da her çalışmada 10 tane çek)
  try {
    const pastes = await scanPastebinTrends();
    pastes.forEach((p) => candidatePages.add(p));
    push({ level: "ok", phase: "discover", message: `pastebin archive → ${pastes.length} paste` });
  } catch {
    /* ignore */
  }

  const pages = Array.from(candidatePages).slice(0, HOST_LIMIT_PER_RUN);
  summary.pages = pages.length;

  // 4) Her sayfayı indir → stream URL & metadata çıkar → validate → sınıflandır → kaydet
  for (const page of pages) {
    try {
      const r = await safeFetch(page, { timeoutMs: 10000 });
      if (!r.text) continue;

      const streams = extractStreamUrls(r.text).slice(0, STREAMS_PER_PAGE);
      const iframes = extractIframes(r.text, page).slice(0, 3);

      // iframe'lerin içine de dal (1 seviye derinlik)
      for (const iframe of iframes) {
        const ir = await safeFetch(iframe, { timeoutMs: 8000, referer: page });
        if (ir.text) extractStreamUrls(ir.text).forEach((s) => streams.push(s));
      }

      const uniqueStreams = Array.from(new Set(streams));
      summary.candidates += uniqueStreams.length;
      if (!uniqueStreams.length) continue;

      const title = r.text.match(TITLE_RE)?.[1] ?? "";
      const desc = r.text.match(META_DESC_RE)?.[1] ?? "";
      const poster = r.text.match(OG_IMAGE_RE)?.[1] ?? null;
      const host = (() => {
        try {
          return new URL(page).host;
        } catch {
          return "unknown";
        }
      })();

      push({ level: "info", phase: "extract", message: `${host} → ${uniqueStreams.length} aday`, meta: { page } });

      // Failover group anchor = temizlenmiş title
      const cleaned = cleanTitle(title);

      for (const stream of uniqueStreams) {
        // Validate
        const v = await validateStream(stream, page);
        if (!v.ok || !v.isVideo) {
          push({ level: "warn", phase: "validate", message: `RED ${stream.slice(0, 80)} (${v.status})` });
          continue;
        }
        if (v.geoBlocked) {
          push({ level: "warn", phase: "validate", message: `geoblocked ${stream.slice(0, 80)}` });
          // yine kaydet, ama etikete geoblocked ekle
        }
        summary.validated += 1;

        // AI classify (best effort; fallback keyword)
        const ai = await classifyContent({
          title,
          description: desc,
          sourceUrl: page,
          streamUrl: stream,
        });
        const finalTitle = ai?.title || cleaned;
        const category = ai?.category || guessCategory(`${title} ${desc} ${stream}`);
        const type = ai?.type || guessType(`${title} ${stream}`);
        const resolution = v.resolution !== "unknown" ? v.resolution : ai?.quality || "unknown";

        // Dedupe upsert
        const row = {
          title: finalTitle,
          normalized_title: finalTitle.toLowerCase(),
          type,
          category: v.geoBlocked ? `${category} (GEO)` : category,
          stream_url: stream,
          poster_image_url: poster,
          resolution,
          source: host,
          source_website: page,
          custom_headers: v.customHeaders as never,
          failover_group: finalTitle.toLowerCase(),
          status: "active",
          failure_count: 0,
          last_checked_at: new Date().toISOString(),
          is_active: true,
        };

        const { data: existing } = await supabaseAdmin
          .from("autonomous_streams")
          .select("id, choicely_id")
          .eq("stream_url", stream)
          .maybeSingle();

        let choicelyId: string | null = existing?.choicely_id ?? null;

        if (existing) {
          await supabaseAdmin
            .from("autonomous_streams")
            .update({ ...row, updated_at: new Date().toISOString() } as never)
            .eq("id", existing.id);
          summary.updated += 1;
        } else {
          const { data: ins } = await supabaseAdmin
            .from("autonomous_streams")
            .insert(row as never)
            .select("id")
            .single();
          summary.inserted += 1;
          push({ level: "ok", phase: "extract", message: `+ ${finalTitle} [${resolution}]`, meta: { id: ins?.id } });
        }

        // Choicely push
        const cp = await pushToChoicely({
          title: finalTitle,
          type,
          source: host,
          category,
          poster_image_url: poster,
          video_stream_url: stream,
          is_active: true,
          custom_headers: v.customHeaders,
          resolution,
        });
        if (cp.ok) {
          summary.pushed += 1;
          if (cp.id && cp.id !== choicelyId) {
            await supabaseAdmin
              .from("autonomous_streams")
              .update({ choicely_id: cp.id, last_pushed_at: new Date().toISOString() } as never)
              .eq("stream_url", stream);
          } else {
            await supabaseAdmin
              .from("autonomous_streams")
              .update({ last_pushed_at: new Date().toISOString() } as never)
              .eq("stream_url", stream);
          }
          push({ level: "ok", phase: "push", message: `→ Choicely: ${finalTitle}` });
        } else {
          push({ level: "warn", phase: "push", message: `Choicely reddetti: ${cp.error}` });
        }
      }
    } catch (e) {
      push({ level: "error", phase: "extract", message: `${page}: ${(e as Error).message}` });
    }
  }

  push({
    level: "info",
    phase: "discover",
    message: `Tamamlandı — ${summary.inserted} yeni, ${summary.updated} güncel, ${summary.pushed} Choicely'e gitti.`,
  });
  await log(buffer);
  return summary;
}

export type HealthSummary = {
  checked: number;
  killed: number;
  restored: number;
  removedFromChoicely: number;
};

export async function runHealthCheck(): Promise<HealthSummary> {
  const summary: HealthSummary = { checked: 0, killed: 0, restored: 0, removedFromChoicely: 0 };
  const { data: rows } = await supabaseAdmin
    .from("autonomous_streams")
    .select("id, stream_url, failure_count, status, choicely_id, source_website")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(120);
  const buffer: LogRow[] = [
    { level: "info", phase: "health", message: `Sağlık taraması: ${rows?.length ?? 0} link` },
  ];

  for (const row of rows ?? []) {
    summary.checked += 1;
    const v = await validateStream(row.stream_url, row.source_website ?? undefined);
    const now = new Date().toISOString();
    if (v.ok && v.isVideo) {
      await supabaseAdmin
        .from("autonomous_streams")
        .update({ failure_count: 0, status: "active", is_active: true, last_checked_at: now } as never)
        .eq("id", row.id);
      if (row.status !== "active") summary.restored += 1;
    } else {
      const nextFail = (row.failure_count ?? 0) + 1;
      const shouldKill = nextFail >= 3;
      await supabaseAdmin
        .from("autonomous_streams")
        .update({
          failure_count: nextFail,
          status: shouldKill ? "inactive" : row.status,
          is_active: !shouldKill,
          last_checked_at: now,
        } as never)
        .eq("id", row.id);
      if (shouldKill) {
        summary.killed += 1;
        buffer.push({ level: "warn", phase: "health", message: `× ölü link: ${row.stream_url.slice(0, 80)}` });
        const dc = await deactivateOnChoicely(row.choicely_id, row.stream_url);
        if (dc.ok) summary.removedFromChoicely += 1;
      }
    }
  }
  buffer.push({
    level: "ok",
    phase: "health",
    message: `Health done — ${summary.killed} elendi, ${summary.restored} geri geldi, ${summary.removedFromChoicely} Choicely'den silindi.`,
  });
  await log(buffer);
  return summary;
}
