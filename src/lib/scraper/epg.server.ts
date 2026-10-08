// XMLTV EPG ingestion + channel matching.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { smartFetch } from "./fetch.server";

export function normKey(name: string) {
  return name
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/\b(hd|fhd|uhd|4k|sd|tv|canli|canlı|izle)\b/g, " ")
    .replace(/[^a-z0-9ğüşıöç]+/g, "")
    .trim();
}

function xmltvTime(v: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return null;
  const tz = m[7] ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : "+00:00";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`;
}

export async function syncEpg(limitPerSource = 4000) {
  const { data: sources } = await supabaseAdmin.from("epg_sources").select("id,url").eq("active", true);
  let total = 0;
  for (const s of sources ?? []) {
    const res = await smartFetch(s.url, { timeoutMs: 20000, kind: "api", attempts: 2, useProxy: false });
    if (!res.text) continue;

    const names = new Map<string, string>();
    const chRx = /<channel[^>]+id="([^"]+)"[\s\S]*?<display-name[^>]*>([^<]+)<\/display-name>/gi;
    let c: RegExpExecArray | null;
    while ((c = chRx.exec(res.text))) names.set(c[1], c[2].trim());

    const rows: Array<Record<string, string>> = [];
    const pRx = /<programme[^>]*start="([^"]+)"[^>]*stop="([^"]+)"[^>]*channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/gi;
    let p: RegExpExecArray | null;
    while ((p = pRx.exec(res.text)) && rows.length < limitPerSource) {
      const start = xmltvTime(p[1]);
      const stop = xmltvTime(p[2]);
      if (!start || !stop) continue;
      const title = p[4].match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
      if (!title) continue;
      const desc = p[4].match(/<desc[^>]*>([^<]+)<\/desc>/i)?.[1]?.trim() ?? "";
      const chName = names.get(p[3]) ?? p[3];
      rows.push({ channel_key: normKey(chName), channel_name: chName, title, description: desc, start_at: start, stop_at: stop });
    }

    for (let i = 0; i < rows.length; i += 500) {
      await supabaseAdmin.from("epg_programs").upsert(rows.slice(i, i + 500) as never, { onConflict: "channel_key,start_at" });
    }
    await supabaseAdmin.from("epg_sources").update({ last_synced_at: new Date().toISOString(), program_count: rows.length }).eq("id", s.id);
    total += rows.length;
  }
  await supabaseAdmin.from("epg_programs").delete().lt("stop_at", new Date(Date.now() - 86400000).toISOString());
  return { sources: sources?.length ?? 0, programs: total };
}

export async function nowNext(channelKeys: string[]) {
  if (!channelKeys.length) return {} as Record<string, { now?: string; next?: string }>;
  const nowIso = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("epg_programs")
    .select("channel_key,title,start_at,stop_at")
    .in("channel_key", channelKeys.slice(0, 200))
    .gte("stop_at", nowIso)
    .order("start_at")
    .limit(1000);
  const out: Record<string, { now?: string; next?: string }> = {};
  for (const p of data ?? []) {
    const slot = out[p.channel_key] ?? (out[p.channel_key] = {});
    if (p.start_at <= nowIso && !slot.now) slot.now = p.title;
    else if (!slot.next) slot.next = p.title;
  }
  return out;
}
