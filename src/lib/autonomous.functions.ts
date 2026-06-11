import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  url: z.string().url(),
  deep: z.boolean().optional(),
});

export type AutonomousResult = {
  ok: boolean;
  runId?: string;
  log: string[];
  saved: number;
  alive: number;
  error?: string;
};

export const autonomousCrawl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<AutonomousResult> => {
    const { fetchHtml } = await import("./fetch-html.server");
    const { extractCandidates, extractStreams, isTrailerish, unique } = await import(
      "./media-extract"
    );
    const { probeMany } = await import("./probe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const log: string[] = [];
    const push = (s: string) => log.push(s);

    push(`[BAŞLADI] ${data.url}`);

    const { data: runRow } = await supabaseAdmin
      .from("crawl_runs")
      .insert({ root_url: data.url, status: "running" })
      .select("id")
      .single();
    const runId = runRow?.id;

    try {
      // 1. Fetch root
      const root = await fetchHtml(data.url);
      if (root.status >= 400 || !root.html) {
        push(`[HATA] Kök sayfa HTTP ${root.status}`);
        await supabaseAdmin
          .from("crawl_runs")
          .update({ status: "error", log })
          .eq("id", runId!);
        return { ok: false, runId, log, saved: 0, alive: 0, error: "Kök sayfa alınamadı." };
      }
      push(`[OK] Kök sayfa ${root.html.length} bayt.`);

      const rootStreams = extractStreams(root.html, root.finalUrl);
      const candidates = extractCandidates(root.html, root.finalUrl, 50);
      push(`[KEŞİF] ${candidates.length} aday, ${rootStreams.length} kök akış.`);

      // 2. Deep crawl: visit each candidate (concurrency 4)
      const deep = data.deep !== false;
      type Enriched = { url: string; title: string; thumbnail: string; streams: string[] };
      const enriched: Enriched[] = [];

      if (deep) {
        const queue = [...candidates];
        async function worker() {
          while (queue.length) {
            const c = queue.shift();
            if (!c) break;
            try {
              const page = await fetchHtml(c.url, 10000);
              const streams = extractStreams(page.html, page.finalUrl);
              enriched.push({ ...c, streams });
            } catch {
              enriched.push({ ...c, streams: [] });
            }
          }
        }
        await Promise.all(Array.from({ length: 4 }, worker));
        push(`[ÇÖZÜM] ${enriched.length} sayfa tarandı.`);
      } else {
        enriched.push(...candidates.map((c) => ({ ...c, streams: [] })));
      }

      // 3. Build candidate stream set + probe liveness
      const allStreams = unique([
        ...rootStreams,
        ...enriched.flatMap((e) => e.streams),
      ]);
      const probeMap = await probeMany(allStreams.slice(0, 80), 8);
      const aliveCount = [...probeMap.values()].filter(Boolean).length;
      push(`[DOĞRULAMA] ${aliveCount}/${probeMap.size} akış canlı.`);

      // 4. AI organize
      const aiPayload = enriched
        .filter((e) => !isTrailerish(e.title, e.url))
        .map((e) => ({
          title: e.title,
          url: e.url,
          streams: e.streams.filter((s) => probeMap.get(s) !== false).slice(0, 2),
        }));

      const { organizeMedia } = await import("./organize.functions");
      const aiRes = await organizeMedia({
        data: {
          rootUrl: data.url,
          items: aiPayload,
          rootStreams: rootStreams.filter((s) => probeMap.get(s) !== false).slice(0, 30),
        },
      });

      if (!aiRes.ok) {
        push(`[AI HATA] ${aiRes.error}`);
        await supabaseAdmin
          .from("crawl_runs")
          .update({ status: "ai_error", log })
          .eq("id", runId!);
        return { ok: false, runId, log, saved: 0, alive: aliveCount, error: aiRes.error };
      }
      push(`[AI] ${aiRes.items.length} sınıflandırılmış kayıt.`);

      // 5. Upsert into DB. For each AI item, find best matching stream from
      // its candidate or root pool. If no stream → skip.
      const urlToEnriched = new Map(enriched.map((e) => [e.url, e]));
      const aliveRoot = rootStreams.filter((s) => probeMap.get(s) !== false);
      const records: Array<{
        source_url: string;
        stream_url: string;
        title: string;
        kind: "dizi" | "film" | "canli";
        season: number | null;
        episode: number | null;
        episode_name: string | null;
        year: number | null;
        thumbnail: string | null;
        is_alive: boolean;
      }> = [];

      for (const item of aiRes.items) {
        const src = urlToEnriched.get(item.url);
        const streamPool = unique([
          ...((src?.streams || []).filter((s) => probeMap.get(s) !== false)),
          ...aliveRoot,
        ]);
        const stream = streamPool[0];
        if (!stream) continue;
        records.push({
          source_url: item.url,
          stream_url: stream,
          title: item.title.slice(0, 250),
          kind: item.type,
          season: item.season ?? null,
          episode: item.episode ?? null,
          episode_name: item.episodeName?.slice(0, 250) ?? null,
          year: item.year ?? null,
          thumbnail: src?.thumbnail?.slice(0, 500) ?? null,
          is_alive: true,
          last_checked_at: new Date().toISOString(),
        } as never);
      }

      let saved = 0;
      if (records.length > 0) {
        const { error: upsertErr, count } = await supabaseAdmin
          .from("media_items")
          .upsert(records, { onConflict: "source_url,stream_url", count: "exact" });
        if (upsertErr) push(`[DB HATA] ${upsertErr.message}`);
        else saved = count ?? records.length;
        push(`[KAYIT] ${saved} medya öğesi kütüphaneye eklendi.`);
      } else {
        push(`[UYARI] Kaydedilebilir canlı akış bulunamadı.`);
      }

      await supabaseAdmin
        .from("crawl_runs")
        .update({ status: "done", log, item_count: saved })
        .eq("id", runId!);

      return { ok: true, runId, log, saved, alive: aliveCount };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push(`[İSTİSNA] ${msg}`);
      console.error("autonomousCrawl error", e);
      if (runId) {
        await supabaseAdmin
          .from("crawl_runs")
          .update({ status: "error", log })
          .eq("id", runId);
      }
      return { ok: false, runId, log, saved: 0, alive: 0, error: msg };
    }
  });
