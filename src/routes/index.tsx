import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Copy,
  Link2,
  LoaderCircle,
  Play,
  Search,
  Sparkles,
  Tv,
} from "lucide-react";

import { HlsPlayer } from "../components/HlsPlayer";
import { crawlUrl } from "../lib/crawl.functions";
import { organizeMedia } from "../lib/organize.functions";

type CrawlStatus = "pending" | "scanning" | "done" | "empty" | "error";

type SeriesItem = {
  id: string;
  name: string;
  link: string;
  thumb?: string;
  status: CrawlStatus;
  streams: string[];
};

type AiItem = {
  type: "dizi" | "film" | "canli";
  title: string;
  season?: number | null;
  episode?: number | null;
  episodeName?: string | null;
  year?: number | null;
  url: string;
};

const PRESETS = [
  { label: "Kanal D", url: "https://www.kanald.com.tr/diziler", kind: "dizi" },
  { label: "Star TV", url: "https://www.startv.com.tr/dizi", kind: "dizi" },
  { label: "Show TV", url: "https://www.showtv.com.tr/diziler", kind: "dizi" },
  { label: "ATV", url: "https://www.atv.com.tr/diziler", kind: "dizi" },
  { label: "TRT 1", url: "https://www.trtizle.com/canli/tv/trt-1", kind: "canli" },
  { label: "NOW", url: "https://www.nowtv.com.tr/diziler", kind: "dizi" },
  { label: "PuhuTV", url: "https://puhutv.com", kind: "film" },
] as const;

const STREAM_RE = /https?:\/\/[^\s'"<>()\\]+?\.(?:m3u8|mp4|mpd|ts)(?:\?[^\s'"<>()\\]*)?/gi;
const PLAYER_RE = /https?:\/\/[^\s'"<>()\\]+?(?:player\.php|embed|stream|hls|playlist)[^\s'"<>()\\]*/gi;
const IFRAME_SRC_RE = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
const MEDIA_HINT_RE =
  /(dizi|canli|canlı|yayin|yayın|film|izle|bolum|bölüm|episode|player|watch|series|show|tv|fragman)/i;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "URL Media Crawler" },
      {
        name: "description",
        content:
          "URL üzerinden medya tarama, akış çözümleme ve AI ile dizi-film-canlı yayın organizasyonu.",
      },
      { property: "og:title", content: "URL Media Crawler" },
      {
        property: "og:description",
        content:
          "URL üzerinden medya tarama, akış çözümleme ve AI ile dizi-film-canlı yayın organizasyonu.",
      },
    ],
  }),
  component: IndexPage,
});

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function absUrl(base: string, value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(trimmed)) {
    return "";
  }
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return "";
  }
}

function extractCandidatesFromHtml(html: string, baseUrl: string) {
  const direct = Array.from(html.matchAll(STREAM_RE), (match) => absUrl(baseUrl, match[0]));
  const playerLinks = Array.from(html.matchAll(PLAYER_RE), (match) => absUrl(baseUrl, match[0]));
  const iframes = Array.from(html.matchAll(IFRAME_SRC_RE), (match) => absUrl(baseUrl, match[1]));
  return unique([...direct, ...playerLinks, ...iframes]);
}

function fallbackName(link: string) {
  try {
    const lastPart = new URL(link).pathname.split("/").filter(Boolean).pop() || link;
    return decodeURIComponent(lastPart).replace(/[-_]/g, " ");
  } catch {
    return link;
  }
}

function extractFromHtml(html: string, baseUrl: string) {
  const rootStreams = extractCandidatesFromHtml(html, baseUrl);

  if (typeof DOMParser === "undefined") {
    return { items: [] as SeriesItem[], rootStreams };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const globalThumb = absUrl(
    baseUrl,
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content"),
  );

  const items: SeriesItem[] = [];
  const seen = new Set<string>();

  for (const [index, anchor] of Array.from(doc.querySelectorAll("a[href]")).entries()) {
    const href = absUrl(baseUrl, anchor.getAttribute("href"));
    if (!href || seen.has(href)) continue;

    const text = normalizeText(anchor.textContent || "");
    const img = anchor.querySelector("img");
    const alt = normalizeText(img?.getAttribute("alt") || "");
    const thumb = absUrl(baseUrl, img?.getAttribute("src")) || globalThumb;
    const hint = `${href} ${text} ${alt}`;

    if (!MEDIA_HINT_RE.test(hint) && !thumb) continue;
    seen.add(href);

    items.push({
      id: `${index}-${href}`,
      name: text || alt || fallbackName(href),
      link: href,
      thumb,
      status: "pending",
      streams: [],
    });

    if (items.length >= 72) break;
  }

  return { items, rootStreams };
}

function isAiItem(value: unknown): value is AiItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.type === "dizi" || item.type === "film" || item.type === "canli") &&
    typeof item.title === "string" &&
    typeof item.url === "string"
  );
}

function statusLabel(status: CrawlStatus) {
  switch (status) {
    case "scanning":
      return "Taranıyor";
    case "done":
      return "Hazır";
    case "empty":
      return "Boş";
    case "error":
      return "Hata";
    default:
      return "Bekliyor";
  }
}

function IndexPage() {
  const runCrawl = useServerFn(crawlUrl);
  const runOrganize = useServerFn(organizeMedia);

  const [url, setUrl] = useState<string>(PRESETS[0].url);
  const [logs, setLogs] = useState<string[]>([]);
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [rootStreams, setRootStreams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const [playerSrc, setPlayerSrc] = useState("");
  const [playerTitle, setPlayerTitle] = useState("");
  const [copiedValue, setCopiedValue] = useState("");

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const liveItems = useMemo(() => aiItems.filter((item) => item.type === "canli"), [aiItems]);
  const filmItems = useMemo(() => aiItems.filter((item) => item.type === "film"), [aiItems]);
  const seriesTree = useMemo(() => {
    const grouped = new Map<string, Map<number, AiItem[]>>();

    for (const item of aiItems.filter((entry) => entry.type === "dizi")) {
      const title = normalizeText(item.title) || "Adsız Dizi";
      const season = item.season ?? 0;
      if (!grouped.has(title)) grouped.set(title, new Map());
      const seasons = grouped.get(title)!;
      if (!seasons.has(season)) seasons.set(season, []);
      seasons.get(season)!.push(item);
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([title, seasons]) => ({
        title,
        seasons: [...seasons.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([season, entries]) => ({
            season,
            entries: [...entries].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0)),
          })),
      }));
  }, [aiItems]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(""), 1500);
    } catch {
      setCopiedValue("");
    }
  }

  function resolvePlayableUrl(sourceUrl: string) {
    if (/\.(m3u8|mp4|mpd|ts)(\?|$)/i.test(sourceUrl)) return sourceUrl;
    const matched = itemsRef.current.find(
      (item) => item.link === sourceUrl || item.streams.includes(sourceUrl),
    );
    return matched?.streams[0] || "";
  }

  async function handleScan(nextUrl?: string) {
    const candidate = (nextUrl ?? url).trim();
    if (!candidate) return;

    setLoading(true);
    setAiItems([]);
    setPlayerSrc("");
    setPlayerTitle("");
    setLogs([`[BAŞLADI] ${candidate}`]);

    try {
      const result = await runCrawl({ data: { url: candidate } });
      const extracted = extractFromHtml(result.html, result.finalUrl || candidate);
      setUrl(candidate);
      setLogs(result.log?.length ? result.log : [`[OK] ${candidate}`]);
      setItems(extracted.items);
      setRootStreams(extracted.rootStreams);
      if (extracted.items.length === 0 && extracted.rootStreams.length === 0) {
        setLogs((prev) => [...prev, "[UYARI] Çözümlenebilir içerik bulunamadı."]);
      }
    } catch (error) {
      console.error(error);
      setLogs((prev) => [...prev, "[HATA] URL taraması tamamlanamadı."]);
      setItems([]);
      setRootStreams([]);
    } finally {
      setLoading(false);
    }
  }

  async function resolveOne(id: string) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;

    setItems((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, status: "scanning" } : entry)),
    );

    try {
      const result = await runCrawl({ data: { url: item.link } });
      const extracted = extractFromHtml(result.html, result.finalUrl || item.link);
      const streams = unique([...item.streams, ...extracted.rootStreams]).slice(0, 8);

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, streams, status: streams.length ? "done" : "empty" }
            : entry,
        ),
      );
    } catch (error) {
      console.error(error);
      setItems((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, status: "error" } : entry)),
      );
    }
  }

  async function deepCrawl() {
    if (resolving || itemsRef.current.length === 0) return;

    setResolving(true);
    const queue = itemsRef.current.map((item) => item.id);
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const current = queue[cursor++];
        await resolveOne(current);
      }
    }

    try {
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      setResolving(false);
    }
  }

  async function scanLivePool() {
    const livePresets = PRESETS.filter((preset) => preset.kind === "canli");
    setLoading(true);
    setAiItems([]);
    setPlayerSrc("");
    setPlayerTitle("");
    setLogs(["[CANLI] Havuz taraması başladı."]);

    try {
      const mergedItems: SeriesItem[] = [];
      const mergedStreams: string[] = [];

      for (const preset of livePresets) {
        const result = await runCrawl({ data: { url: preset.url } });
        const extracted = extractFromHtml(result.html, result.finalUrl || preset.url);
        mergedItems.push(
          ...extracted.items.map((item) => ({
            ...item,
            id: `${preset.label}-${item.id}`,
          })),
        );
        mergedStreams.push(...extracted.rootStreams);
        setLogs((prev) => [...prev, `[OK] ${preset.label} işlendi.`]);
      }

      const deduped = new Map<string, SeriesItem>();
      for (const item of mergedItems) {
        if (!deduped.has(item.link)) deduped.set(item.link, item);
      }

      setItems([...deduped.values()]);
      setRootStreams(unique(mergedStreams));
    } catch (error) {
      console.error(error);
      setLogs((prev) => [...prev, "[HATA] Canlı TV havuzu tamamlanamadı."]);
    } finally {
      setLoading(false);
    }
  }

  async function runAiOrganize() {
    if (aiLoading) return;

    const payload = itemsRef.current.map((item) => ({
      title: item.name,
      url: item.link,
      streams: item.streams,
    }));

    if (payload.length === 0 && rootStreams.length === 0) {
      setLogs((prev) => [...prev, "[UYARI] AI için işlenecek medya bulunamadı."]);
      return;
    }

    setAiLoading(true);

    try {
      const result = await runOrganize({
        data: {
          rootUrl: url,
          rootStreams,
          items: payload,
        },
      });

      if (!result.ok) {
        setLogs((prev) => [...prev, `[AI] ${result.error}`]);
        setAiItems([]);
        return;
      }

      const normalized = (Array.isArray(result.items) ? result.items : []).filter(isAiItem);
      setAiItems(normalized);
      setLogs((prev) => [...prev, `[AI] ${normalized.length} kayıt düzenlendi.`]);
    } catch (error) {
      console.error(error);
      setLogs((prev) => [...prev, "[AI] Organizasyon çağrısı başarısız oldu."]);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="grid-bg border-b border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <header className="flex flex-col gap-5">
            <p className="text-sm font-medium text-muted-foreground">Medya Bağlantı ve URL Tarama Merkezi</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  URL Media Crawler
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Ana bağlantıyı tara, akışları çöz, sonra sonuçları dizi, film ve canlı yayın ağacına ayır.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[340px]">
                <Stat label="Kaynak" value={String(items.length)} />
                <Stat label="Akış" value={String(rootStreams.length)} />
                <Stat label="AI" value={String(aiItems.length)} />
              </div>
            </div>
          </header>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <label className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card/70 px-4">
              <Link2 className="size-4 text-muted-foreground" />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleScan();
                }}
                placeholder="https://www.kanald.com.tr/diziler"
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Tarama adresi"
              />
            </label>

            <button
              onClick={() => void handleScan()}
              disabled={loading}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
              Platformu Tara
            </button>

            <button
              onClick={() => void deepCrawl()}
              disabled={loading || resolving || items.length === 0}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {resolving ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              İçeriği Çöz
            </button>

            <button
              onClick={() => void runAiOrganize()}
              disabled={loading || aiLoading}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {aiLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Gemini AI Organize Et
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => void handleScan(preset.url)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                {preset.label}
              </button>
            ))}

            <button
              onClick={() => void scanLivePool()}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              <Tv className="size-4" />
              Canlı TV Havuzu
            </button>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:px-8">
          <div className="space-y-4">
            <SectionHeading title="Bulunan Kayıtlar" subtitle="Linkler ve çözümlenen akışlar" />

            {items.length === 0 ? (
              <EmptyState label="Tarama sonucu burada görünecek." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="flex min-h-[250px] flex-col overflow-hidden rounded-lg border border-border bg-card/70"
                  >
                    <div className="aspect-[16/9] bg-muted">
                      {item.thumb ? (
                        <img
                          src={item.thumb}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Görsel yok
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="line-clamp-2 text-base font-medium">{item.name}</h2>
                          <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                            {statusLabel(item.status)}
                          </span>
                        </div>

                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 text-sm text-muted-foreground hover:text-foreground"
                        >
                          {item.link}
                        </a>
                      </div>

                      <div className="mt-auto flex flex-wrap gap-2">
                        <button
                          onClick={() => void resolveOne(item.id)}
                          disabled={item.status === "scanning"}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
                        >
                          {item.status === "scanning" ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Search className="size-4" />
                          )}
                          Çöz
                        </button>

                        {item.streams[0] ? (
                          <button
                            onClick={() => {
                              setPlayerTitle(item.name);
                              setPlayerSrc(item.streams[0]);
                            }}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                          >
                            <Play className="size-4" />
                            Oynat
                          </button>
                        ) : null}
                      </div>

                      {item.streams.length > 0 ? (
                        <div className="space-y-2">
                          {item.streams.slice(0, 3).map((stream) => (
                            <div
                              key={stream}
                              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                            >
                              <span className="truncate text-xs text-muted-foreground">{stream}</span>
                              <button
                                onClick={() => void copy(stream)}
                                className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
                                aria-label="Akışı kopyala"
                              >
                                <Copy className="size-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SectionHeading title="Komut Akışı" subtitle="Sunucu logları ve ana akışlar" />

            <div className="rounded-lg border border-border bg-card/70 p-4">
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                {logs.length === 0 ? (
                  <p>Hazır.</p>
                ) : (
                  logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-card/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium">Kök Akışlar</h2>
                <span className="text-xs text-muted-foreground">{rootStreams.length}</span>
              </div>

              {rootStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz çözümlenen doğrudan akış yok.</p>
              ) : (
                rootStreams.slice(0, 6).map((stream) => (
                  <div
                    key={stream}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <button
                      onClick={() => {
                        setPlayerTitle("Kök akış");
                        setPlayerSrc(stream);
                      }}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
                      aria-label="Akışı oynat"
                    >
                      <Play className="size-4" />
                    </button>

                    <span className="truncate text-xs text-muted-foreground">{stream}</span>

                    <button
                      onClick={() => void copy(stream)}
                      className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
                      aria-label="Akışı kopyala"
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-card/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium">Oynatıcı</h2>
                {copiedValue ? <span className="text-xs text-muted-foreground">Kopyalandı</span> : null}
              </div>

              {playerSrc ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{playerTitle}</p>
                  <HlsPlayer src={playerSrc} />
                </div>
              ) : (
                <EmptyState label="Oynatılacak bir akış seç." compact />
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <SectionHeading title="AI Ağacı" subtitle="Dizi, film ve canlı yayın düzeni" />

          {aiItems.length === 0 ? (
            <EmptyState label="AI çıktısı burada listelenecek." />
          ) : (
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clapperboard className="size-4 text-muted-foreground" />
                  <h2 className="text-base font-medium">Diziler</h2>
                </div>

                <div className="space-y-3">
                  {seriesTree.length === 0 ? (
                    <EmptyState label="Dizi kaydı yok." compact />
                  ) : (
                    seriesTree.map((show) => (
                      <article key={show.title} className="rounded-lg border border-border bg-card/70 p-4">
                        <h3 className="text-base font-medium">{show.title}</h3>
                        <div className="mt-3 space-y-3">
                          {show.seasons.map((season) => (
                            <div key={`${show.title}-${season.season}`} className="space-y-2">
                              <p className="text-sm text-muted-foreground">
                                {season.season > 0 ? `Sezon ${season.season}` : "Sezon bilinmiyor"}
                              </p>
                              <div className="space-y-2">
                                {season.entries.map((entry) => {
                                  const playable = resolvePlayableUrl(entry.url);
                                  return (
                                    <div
                                      key={`${entry.title}-${entry.episode}-${entry.url}`}
                                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                                    >
                                      <span className="text-sm">
                                        {entry.episode ? `${entry.episode}. Bölüm` : "Bölüm"}
                                        {entry.episodeName ? ` · ${entry.episodeName}` : ""}
                                      </span>
                                      {playable ? (
                                        <button
                                          onClick={() => {
                                            setPlayerTitle(entry.title);
                                            setPlayerSrc(playable);
                                          }}
                                          className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
                                          aria-label="Bölümü oynat"
                                        >
                                          <Play className="size-4" />
                                        </button>
                                      ) : null}
                                      <button
                                        onClick={() => void copy(playable || entry.url)}
                                        className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
                                        aria-label="Bağlantıyı kopyala"
                                      >
                                        <Copy className="size-4" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Tv className="size-4 text-muted-foreground" />
                  <h2 className="text-base font-medium">Canlı Yayınlar</h2>
                </div>

                {liveItems.length === 0 ? (
                  <EmptyState label="Canlı kayıt yok." compact />
                ) : (
                  <div className="space-y-2">
                    {liveItems.map((item) => {
                      const playable = resolvePlayableUrl(item.url) || item.url;
                      return (
                        <div
                          key={`${item.title}-${item.url}`}
                          className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-3"
                        >
                          <span className="text-sm font-medium">{item.title}</span>
                          <button
                            onClick={() => {
                              setPlayerTitle(item.title);
                              setPlayerSrc(playable);
                            }}
                            className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-border bg-background"
                            aria-label="Yayını oynat"
                          >
                            <Play className="size-4" />
                          </button>
                          <button
                            onClick={() => void copy(playable)}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background"
                            aria-label="Yayın bağlantısını kopyala"
                          >
                            <Copy className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <h2 className="text-base font-medium">Filmler</h2>
                </div>

                {filmItems.length === 0 ? (
                  <EmptyState label="Film kaydı yok." compact />
                ) : (
                  <div className="space-y-2">
                    {filmItems.map((item) => {
                      const playable = resolvePlayableUrl(item.url) || item.url;
                      return (
                        <div
                          key={`${item.title}-${item.url}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{item.title}</p>
                            {item.year ? (
                              <p className="text-xs text-muted-foreground">{item.year}</p>
                            ) : null}
                          </div>
                          <button
                            onClick={() => {
                              setPlayerTitle(item.title);
                              setPlayerSrc(playable);
                            }}
                            className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-border bg-background"
                            aria-label="Filmi oynat"
                          >
                            <Play className="size-4" />
                          </button>
                          <button
                            onClick={() => void copy(playable)}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background"
                            aria-label="Film bağlantısını kopyala"
                          >
                            <Copy className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border bg-card/40 text-muted-foreground ${
        compact ? "px-4 py-6 text-sm" : "px-4 py-10 text-sm"
      }`}
    >
      {label}
    </div>
  );
}
