// YouTube keşfi: yalnızca doğrulanmış (resmi) kanalların uzun videoları alınır.
// Link olarak YouTube izleme/embed adresi saklanır; ham video akışı çıkarılmaz.
import { smartFetch } from "./fetch.server";

export type YtVideo = {
  id: string; title: string; channel: string; seconds: number; thumb: string | null; verified: boolean;
};

export const YT_QUERIES: Array<{ q: string; kind: "movie" | "series" }> = [
  { q: "türk filmi tek parça", kind: "movie" },
  { q: "yerli film full hd", kind: "movie" },
  { q: "komedi filmi tek parça", kind: "movie" },
  { q: "dram filmi full film", kind: "movie" },
  { q: "aksiyon filmi türk full", kind: "movie" },
  { q: "yeşilçam filmi tek parça", kind: "movie" },
  { q: "aile filmi full izle", kind: "movie" },
  { q: "dizi 1. bölüm full", kind: "series" },
  { q: "dizi son bölüm full hd", kind: "series" },
  { q: "yerli dizi tüm bölümler", kind: "series" },
  { q: "komedi dizisi bölüm full", kind: "series" },
  { q: "tarihi dizi bölüm full", kind: "series" },
];

function toSeconds(t?: string): number {
  if (!t) return 0;
  return t.split(":").map(Number).reduce((a, n) => a * 60 + (Number.isFinite(n) ? n : 0), 0);
}

type Node = Record<string, unknown> | unknown[];

function collect(o: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(o)) { for (const v of o) collect(v, out); return; }
  if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (r["videoRenderer"]) out.push(r["videoRenderer"] as Record<string, unknown>);
    for (const v of Object.values(r)) if (v && typeof v === "object") collect(v as Node, out);
  }
}

export async function searchYouTube(query: string): Promise<YtVideo[]> {
  // sp=EgIYAg== → 20 dakikadan uzun videolar
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIYAg%253D%253D&hl=tr&gl=TR`;
  const r = await smartFetch(url, { timeoutMs: 12000, attempts: 2 });
  if (!r.text) return [];
  const m = r.text.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  let data: unknown;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const raw: Record<string, unknown>[] = [];
  collect(data, raw);
  const out: YtVideo[] = [];
  for (const v of raw) {
    const id = v["videoId"] as string | undefined;
    if (!id) continue;
    const title = ((v["title"] as { runs?: { text: string }[] })?.runs ?? []).map((x) => x.text).join("");
    const channel = ((v["ownerText"] as { runs?: { text: string }[] })?.runs ?? [])[0]?.text ?? "";
    const seconds = toSeconds((v["lengthText"] as { simpleText?: string })?.simpleText);
    const thumbs = (v["thumbnail"] as { thumbnails?: { url: string }[] })?.thumbnails ?? [];
    const verified = /VERIFIED/.test(JSON.stringify(v["ownerBadges"] ?? []));
    out.push({ id, title, channel, seconds, thumb: thumbs.at(-1)?.url?.split("?")[0] ?? null, verified });
  }
  return out;
}

/** Sadece resmi (doğrulanmış) kanallar + film ≥ 60 dk, bölüm ≥ 25 dk. */
export function acceptVideo(v: YtVideo, kind: "movie" | "series"): boolean {
  if (!v.verified) return false;
  if (/fragman|trailer|kamera arkası|klip|özet|shorts/i.test(v.title)) return false;
  return kind === "movie" ? v.seconds >= 3600 : v.seconds >= 1500;
}
