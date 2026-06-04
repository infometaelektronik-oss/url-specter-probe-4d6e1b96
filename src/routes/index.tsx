import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { crawlUrl } from "@/lib/crawl.functions";
import { organizeMedia } from "@/lib/organize.functions";
import { HlsPlayer } from "@/components/HlsPlayer";

type AiItem = {
  type: "dizi" | "film" | "canli";
  title: string;
  season?: number | null;
  episode?: number | null;
  episodeName?: string | null;
  year?: number | null;
  url: string;
};


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "URL Media Crawler — Akış Tarama Merkezi" },
      {
        name: "description",
        content:
          "URL üzerinden derinlemesine medya tarama: diziler, kanallar, .m3u8 ve .mp4 akış linklerini Chrome kamuflajıyla cımbızla çek.",
      },
      { property: "og:title", content: "URL Media Crawler" },
      {
        property: "og:description",
        content:
          "Linki ver, akışı al. Chrome User-Agent kamuflajı ile tek URL'den derinlemesine medya keşfi.",
      },
    ],
  }),
  component: CrawlerPage,
});

type SeriesItem = {
  id: string;
  name: string;
  link: string;
  thumb?: string;
  status: "pending" | "scanning" | "done" | "empty" | "error";
  streams: string[];
  iframes: string[];
};

type Preset = {
  key: string;
  name: string;
  url: string;
  badge: string;
  color: "primary" | "secondary";
};

const PRESETS: Preset[] = [
  { key: "kanald", name: "Kanal D", url: "https://www.kanald.com.tr/diziler", badge: "TV", color: "primary" },
  { key: "star", name: "Star TV", url: "https://www.startv.com.tr/dizi", badge: "TV", color: "primary" },
  { key: "show", name: "Show TV", url: "https://www.showtv.com.tr/dizi", badge: "TV", color: "primary" },
  { key: "atv", name: "ATV", url: "https://www.atv.com.tr/diziler", badge: "TV", color: "primary" },
  { key: "trt1", name: "TRT 1", url: "https://www.trtizle.com/canli/tv/trt-1", badge: "LIVE", color: "secondary" },
  { key: "now", name: "NOW (Fox)", url: "https://www.nowtv.com.tr/diziler", badge: "TV", color: "primary" },
  { key: "puhu", name: "PuhuTV", url: "https://puhutv.com", badge: "VOD", color: "secondary" },
  { key: "hdfc", name: "HDFilmCehennemi", url: "https://hdfilmcehennemi.life", badge: "FILM", color: "secondary" },
  { key: "fhd", name: "FullHDFilmIzlesene", url: "https://www.fullhdfilmizlesene.pw", badge: "FILM", color: "secondary" },
  { key: "fm", name: "FilmMakinesi", url: "https://www.filmmakinesi.cc", badge: "FILM", color: "secondary" },
];

function absUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const STREAM_RE =
  /https?:\/\/[^\s'"<>()\\]+?\.(?:m3u8|mp4|mpd|ts)(?:\?[^\s'"<>()\\]*)?/gi;
const PLAYER_RE =
  /https?:\/\/[^\s'"<>()\\]+?(?:player\.php|embed|stream|hls|playlist)[^\s'"<>()\\]*/gi;
const IFRAME_SRC_RE = /<iframe[^>]+src=["']([^"']+)["']/gi;

function extractFromHtml(html: string, baseUrl: string) {
  const doc =
    typeof DOMParser !== "undefined"
      ? new DOMParser().parseFromString(html, "text/html")
      : null;

  const streamSet = new Set<string>();
  let m;
  while ((m = STREAM_RE.exec(html)) !== null) streamSet.add(m[0]);
  while ((m = PLAYER_RE.exec(html)) !== null) streamSet.add(m[0]);

  const iframeSet = new Set<string>();
  let im;
  while ((im = IFRAME_SRC_RE.exec(html)) !== null) {
    const abs = absUrl(im[1], baseUrl);
    if (abs && /^https?:/.test(abs)) iframeSet.add(abs);
  }

  if (doc) {
    doc.querySelectorAll("source[src], video[src]").forEach((el) => {
      const s = el.getAttribute("src");
      if (s && /\.(m3u8|mp4|mpd)/i.test(s)) {
        const abs = absUrl(s, baseUrl);
        if (abs) streamSet.add(abs);
      }
    });
  }

  // images
  const imageSet = new Set<string>();
  if (doc) {
    doc.querySelectorAll("img").forEach((img) => {
      const s =
        img.getAttribute("src") ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-original") ||
        img.getAttribute("data-lazy-src");
      if (!s) return;
      const abs = absUrl(s, baseUrl);
      if (abs && /\.(jpe?g|png|webp|avif)/i.test(abs)) imageSet.add(abs);
    });
  }

  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {}
  const items: Omit<SeriesItem, "status" | "streams" | "iframes">[] = [];
  const seen = new Set<string>();
  if (doc) {
    doc.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:")
      )
        return;
      const abs = absUrl(href, baseUrl);
      if (!abs) return;
      let u: URL;
      try {
        u = new URL(abs);
      } catch {
        return;
      }
      if (u.host !== baseHost) return;
      if (u.pathname === "/" || u.pathname === new URL(baseUrl).pathname) return;
      if (seen.has(abs)) return;
      const text = (a.textContent || "").trim().replace(/\s+/g, " ");
      const img = a.querySelector("img");
      const imgSrc =
        img?.getAttribute("src") ||
        img?.getAttribute("data-src") ||
        img?.getAttribute("data-original");
      const title = a.getAttribute("title") || img?.getAttribute("alt") || text;
      if (!title || title.length < 2 || title.length > 80) return;
      const segs = u.pathname.split("/").filter(Boolean);
      if (segs.length < 2 && !imgSrc) return;
      seen.add(abs);
      items.push({
        id: abs,
        name: title,
        link: abs,
        thumb: imgSrc ? absUrl(imgSrc, baseUrl) || undefined : undefined,
      });
    });
  }

  const ogImage = doc
    ?.querySelector('meta[property="og:image"]')
    ?.getAttribute("content");

  return {
    items: items.slice(0, 80),
    streams: Array.from(streamSet),
    iframes: Array.from(iframeSet),
    images: Array.from(imageSet).slice(0, 40),
    ogImage,
  };
}

function CrawlerPage() {
  const crawl = useServerFn(crawlUrl);
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [rootStreams, setRootStreams] = useState<string[]>([]);
  const [rootIframes, setRootIframes] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [deepRunning, setDeepRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const organize = useServerFn(organizeMedia);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(
    null,
  );
  const [tvBusy, setTvBusy] = useState(false);

  function pushLog(line: string) {
    setLogs((l) => [...l.slice(-40), line]);
  }


  async function runScan(target: string) {
    setError(null);
    setItems([]);
    setRootStreams([]);
    setRootIframes([]);
    setImages([]);
    setLogs([]);
    if (!target.trim()) return;
    let t = target.trim();
    if (!/^https?:\/\//i.test(t)) t = "https://" + t;
    setUrl(t);
    setScanning(true);
    pushLog(`[BAŞLAT] Chrome 122 kamuflajı yükleniyor → ${t}`);
    try {
      const res = await crawl({ data: { url: t } });
      res.log.forEach(pushLog);
      if (res.status >= 400) {
        setError(`HTTP ${res.status} — site erişimi engelledi.`);
        return;
      }
      pushLog("[EXTRACT] Regex motoru çalışıyor (m3u8 / mp4 / iframe / player.php)...");
      const { items: found, streams, iframes, images: imgs } = extractFromHtml(
        res.html,
        res.finalUrl,
      );
      setRootStreams(streams);
      setRootIframes(iframes);
      setImages(imgs);
      setItems(
        found.map((f) => ({ ...f, status: "pending", streams: [], iframes: [] })),
      );
      pushLog(
        `[TAMAM] ${found.length} alt sayfa · ${streams.length} akış · ${iframes.length} iframe · ${imgs.length} görsel.`,
      );
    } catch (err) {
      setError((err as Error).message || "Tarama başarısız.");
      pushLog(`[HATA] ${(err as Error).message}`);
    } finally {
      setScanning(false);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    await runScan(url);
  }

  async function resolveOne(item: SeriesItem) {
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, status: "scanning" } : p)),
    );
    try {
      const res = await crawl({ data: { url: item.link } });
      const { streams, iframes, ogImage } = extractFromHtml(res.html, res.finalUrl);
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                status: streams.length || iframes.length ? "done" : "empty",
                streams,
                iframes,
                thumb: p.thumb || ogImage || undefined,
              }
            : p,
        ),
      );
    } catch {
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: "error" } : p)),
      );
    }
  }

  async function deepCrawl() {
    setDeepRunning(true);
    pushLog("[DEEP] Tüm alt sayfalar Chrome kamuflajıyla taranıyor...");
    const queue = items.filter((i) => i.status === "pending");
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (!next) break;
        await resolveOne(next);
      }
    });
    await Promise.all(workers);
    pushLog("[DEEP] Tamamlandı.");
    setDeepRunning(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
    });
  }

  async function runAiOrganize() {
    setAiBusy(true);
    setAiError(null);
    pushLog("[AI] Gemini 2.5 Flash organizasyon motoru çağrılıyor...");
    try {
      const payload = {
        rootUrl: url || undefined,
        rootStreams: rootStreams.slice(0, 50),
        items: items.slice(0, 250).map((i) => ({
          title: i.name,
          url: i.link,
          streams: [...i.streams, ...i.iframes].slice(0, 3),
        })),
      };
      const res = await organize({ data: payload });
      if (!res.ok) {
        setAiError(res.error);
        pushLog(`[AI] HATA: ${res.error}`);
        return;
      }
      setAiItems(res.items as AiItem[]);
      pushLog(`[AI] ${res.items.length} kategorize medya alındı.`);
    } catch (e) {
      const msg = (e as Error).message;
      setAiError(msg);
      pushLog(`[AI] HATA: ${msg}`);
    } finally {
      setAiBusy(false);
    }
  }

  async function unifyLiveTv() {
    setTvBusy(true);
    pushLog("[TV] Tüm ulusal kanallar paralel taranıyor...");
    const tvPresets = PRESETS.filter((p) => p.badge === "TV" || p.badge === "LIVE");
    const collected: { title: string; url: string; streams: string[] }[] = [];
    await Promise.all(
      tvPresets.map(async (p) => {
        try {
          const res = await crawl({ data: { url: p.url } });
          const { streams, iframes } = extractFromHtml(res.html, res.finalUrl);
          collected.push({
            title: p.name,
            url: p.url,
            streams: [...streams, ...iframes].slice(0, 4),
          });
          pushLog(`[TV] ${p.name} → ${streams.length + iframes.length} kaynak`);
        } catch {
          pushLog(`[TV] ${p.name} atlandı (erişim hatası)`);
        }
      }),
    );
    try {
      const res = await organize({
        data: { rootUrl: "tv-unified", items: collected },
      });
      if (res.ok) {
        setAiItems((prev) => {
          const live = (res.items as AiItem[]).filter((i) => i.type === "canli");
          const others = prev.filter((i) => i.type !== "canli");
          return [...live, ...others];
        });
        pushLog(`[TV] AI ${res.items.length} kanal kaydı normalize etti.`);
      } else {
        pushLog(`[TV] AI hata: ${res.error}`);
      }
    } catch (e) {
      pushLog(`[TV] AI hata: ${(e as Error).message}`);
    }
    setTvBusy(false);
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const totalStreams =
    items.reduce((n, i) => n + i.streams.length + i.iframes.length, 0) +
    rootStreams.length +
    rootIframes.length;

  const aiGrouped = useMemo(() => {
    const canli = aiItems.filter((i) => i.type === "canli");
    const filmler = aiItems.filter((i) => i.type === "film");
    const diziRaw = aiItems.filter((i) => i.type === "dizi");
    const diziler = new Map<string, Map<number, AiItem[]>>();
    for (const d of diziRaw) {
      const t = d.title || "Bilinmeyen Dizi";
      const s = d.season ?? 1;
      if (!diziler.has(t)) diziler.set(t, new Map());
      const seasons = diziler.get(t)!;
      if (!seasons.has(s)) seasons.set(s, []);
      seasons.get(s)!.push(d);
    }
    return { canli, filmler, diziler };
  }, [aiItems]);


  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, oklch(0.22 0.04 260) 0%, transparent 60%)",
        }}
      />

      <header className="relative z-10 px-6 py-6 flex items-center justify-between border-b border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              background: "var(--gradient-primary)",
              boxShadow: "var(--shadow-neon)",
            }}
          >
            <span className="font-black text-lg text-primary-foreground">⌬</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">URL MEDIA CRAWLER</h1>
            <p className="text-xs text-muted-foreground">
              Chrome 122 Kamuflaj · Deep Stream Discovery
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            CHROME SPOOF ON
          </span>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 sm:py-12">
        <section className="text-center mb-8">
          <div className="inline-block px-3 py-1 rounded-full border border-border bg-card/60 backdrop-blur text-xs text-muted-foreground mb-4">
            User-Agent Spoof · Headers Spoof · Referer Auto · Retry Fallback
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
            Linki ver, <span className="text-gradient">akışı al.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Sunucu tarafında Chrome 122 başlıkları, Sec-Ch-Ua + Referer
            simülasyonu ile bot korumalarını aşar; <code className="text-primary">.m3u8</code>{" "}
            / <code className="text-secondary">.mp4</code> /{" "}
            <code className="text-primary">iframe</code> /{" "}
            <code className="text-secondary">player.php</code> tüm akışları çıkarır.
          </p>
        </section>

        {/* Presets */}
        <section className="mb-6">
          <div className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2 px-1">
            HIZLI HEDEFLER
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                disabled={scanning}
                onClick={() => runScan(p.url)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  p.color === "primary"
                    ? "border-primary/40 hover:border-primary hover:bg-primary/10 text-foreground"
                    : "border-secondary/40 hover:border-secondary hover:bg-secondary/10 text-foreground"
                }`}
              >
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    p.color === "primary"
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary/20 text-secondary"
                  }`}
                >
                  {p.badge}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleScan} className="relative mb-6">
          <div
            className={`relative rounded-2xl bg-card/80 backdrop-blur border border-border p-2 flex flex-col sm:flex-row gap-2 ${
              scanning ? "animate-pulse-glow" : ""
            }`}
            style={{ boxShadow: "var(--shadow-neon)" }}
          >
            <div className="flex items-center gap-2 flex-1 px-3">
              <span className="text-primary font-mono text-sm">URL ▸</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.kanald.com.tr/diziler"
                className="flex-1 bg-transparent outline-none text-base py-3 placeholder:text-muted-foreground/60"
                disabled={scanning}
              />
            </div>
            <button
              type="submit"
              disabled={scanning || !url.trim()}
              className="px-6 py-3 rounded-xl font-bold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "var(--gradient-primary)" }}
            >
              {scanning ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-orbit" />
                  TARANIYOR
                </>
              ) : (
                "PLATFORMU TARA"
              )}
            </button>
          </div>
          {error && (
            <p className="text-sm text-destructive mt-3 text-center">⚠ {error}</p>
          )}
        </form>

        {/* Live log */}
        {logs.length > 0 && (
          <div className="mb-6 rounded-xl border border-border bg-black/40 backdrop-blur p-3 font-mono text-[11px] max-h-44 overflow-y-auto space-y-0.5">
            {logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.startsWith("[HATA]")
                    ? "text-destructive"
                    : l.startsWith("[UYARI]")
                      ? "text-secondary"
                      : l.startsWith("[OK]") || l.startsWith("[TAMAM]")
                        ? "text-primary"
                        : "text-muted-foreground"
                }
              >
                › {l}
              </div>
            ))}
          </div>
        )}

        {scanning && (
          <div className="flex items-center justify-center py-12">
            <div className="relative w-28 h-28">
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary animate-orbit" />
              <div
                className="absolute inset-3 rounded-full border-2 border-secondary/30 border-b-secondary animate-orbit"
                style={{ animationDirection: "reverse", animationDuration: "3s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-muted-foreground">
                CHROME
              </div>
            </div>
          </div>
        )}

        {(items.length > 0 || rootStreams.length > 0 || rootIframes.length > 0) && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-card/60 border border-border backdrop-blur">
              <div className="flex gap-6 text-sm">
                <Stat label="ALT SAYFA" value={items.length} color="primary" />
                <Stat label="ÇÖZÜLEN" value={doneCount} color="secondary" />
                <Stat label="AKIŞ + IFRAME" value={totalStreams} color="primary" />
                <Stat label="GÖRSEL" value={images.length} color="secondary" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={deepCrawl}
                  disabled={deepRunning || items.every((i) => i.status !== "pending")}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-secondary/50 text-secondary hover:bg-secondary/10 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {deepRunning && (
                    <span className="w-3 h-3 border-2 border-secondary/30 border-t-secondary rounded-full animate-orbit" />
                  )}
                  İÇERİĞİ ÇÖZ (DEEP CRAWL)
                </button>
                <button
                  onClick={runAiOrganize}
                  disabled={aiBusy || items.length === 0}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-primary-foreground transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  {aiBusy && (
                    <span className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-orbit" />
                  )}
                  🤖 GEMINI AI ORGANİZE ET
                </button>
                <button
                  onClick={unifyLiveTv}
                  disabled={tvBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-primary/50 text-primary hover:bg-primary/10 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {tvBusy && (
                    <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-orbit" />
                  )}
                  📡 CANLI TV HAVUZU
                </button>
              </div>
            </div>

            {aiError && (
              <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-sm text-destructive">
                ⚠ {aiError}
              </div>
            )}

            {player && (
              <div className="p-4 rounded-xl border border-primary/40 bg-black/60 backdrop-blur">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-primary truncate">
                    ▶ {player.title}
                  </h3>
                  <button
                    onClick={() => setPlayer(null)}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    KAPAT ✕
                  </button>
                </div>
                <HlsPlayer src={player.url} />
                <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate">
                  {player.url}
                </div>
              </div>
            )}

            {aiItems.length > 0 && (
              <AiTree
                grouped={aiGrouped}
                onPlay={(url, title) => setPlayer({ url, title })}
                onCopy={copy}
                copied={copied}
              />
            )}


            {(rootStreams.length > 0 || rootIframes.length > 0) && (
              <div className="p-4 rounded-xl border border-primary/40 bg-primary/5">
                <h3 className="text-sm font-bold text-primary mb-3">
                  ⚡ Ana sayfadan yakalanan kaynaklar (
                  {rootStreams.length + rootIframes.length})
                </h3>
                <div className="space-y-2">
                  {rootStreams.map((s) => (
                    <StreamRow
                      key={s}
                      url={s}
                      onCopy={copy}
                      copied={copied === s}
                      kind="stream"
                    />
                  ))}
                  {rootIframes.map((s) => (
                    <StreamRow
                      key={s}
                      url={s}
                      onCopy={copy}
                      copied={copied === s}
                      kind="iframe"
                    />
                  ))}
                </div>
              </div>
            )}

            {images.length > 0 && (
              <div className="p-4 rounded-xl border border-secondary/40 bg-secondary/5">
                <h3 className="text-sm font-bold text-secondary mb-3">
                  🖼 Yakalanan film & dizi görselleri ({images.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                  {images.map((src) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-[2/3] rounded-md overflow-hidden border border-border bg-muted hover:border-secondary transition group relative"
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card/60 backdrop-blur overflow-hidden">
              <div className="grid grid-cols-12 text-xs font-bold text-muted-foreground uppercase tracking-wider px-4 py-3 border-b border-border bg-muted/40">
                <div className="col-span-1">#</div>
                <div className="col-span-4 sm:col-span-3">Dizi / Kanal</div>
                <div className="hidden sm:block col-span-3">Platform Linki</div>
                <div className="col-span-5">Canlı Akış / iframe</div>
                <div className="col-span-2 text-right">Durum</div>
              </div>
              <div className="divide-y divide-border">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 px-4 py-3 items-center gap-2 hover:bg-muted/20 transition"
                  >
                    <div className="col-span-1 font-mono text-xs text-muted-foreground">
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="col-span-4 sm:col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-md bg-muted overflow-hidden flex-shrink-0 border border-border">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            ▢
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {item.name}
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:block col-span-3 text-xs text-muted-foreground truncate font-mono">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-secondary"
                      >
                        {new URL(item.link).pathname}
                      </a>
                    </div>
                    <div className="col-span-5 space-y-1 min-w-0">
                      {item.streams.length === 0 && item.iframes.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          {item.status === "pending" && "— bekliyor —"}
                          {item.status === "scanning" && "çözülüyor..."}
                          {item.status === "empty" && "akış bulunamadı"}
                          {item.status === "error" && "hata"}
                        </span>
                      ) : (
                        <>
                          {item.streams.map((s) => (
                            <StreamRow
                              key={s}
                              url={s}
                              onCopy={copy}
                              copied={copied === s}
                              kind="stream"
                              compact
                            />
                          ))}
                          {item.iframes.map((s) => (
                            <StreamRow
                              key={s}
                              url={s}
                              onCopy={copy}
                              copied={copied === s}
                              kind="iframe"
                              compact
                            />
                          ))}
                        </>
                      )}
                    </div>
                    <div className="col-span-2 text-right">
                      <StatusBadge
                        status={item.status}
                        onResolve={() => resolveOne(item)}
                      />
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Henüz alt sayfa yok.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 text-center text-xs text-muted-foreground py-6 border-t border-border/50">
        Server-side Chrome 122 spoof · UA + Sec-Ch-Ua + Referer · Otomatik fallback
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "primary" | "secondary";
}) {
  return (
    <div>
      <div
        className={`text-2xl font-black ${
          color === "primary" ? "text-primary" : "text-secondary"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] font-bold text-muted-foreground tracking-widest">
        {label}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  onResolve,
}: {
  status: SeriesItem["status"];
  onResolve: () => void;
}) {
  if (status === "pending")
    return (
      <button
        onClick={onResolve}
        className="text-[10px] px-2 py-1 rounded border border-primary/50 text-primary hover:bg-primary/10 transition font-bold"
      >
        ÇÖZ
      </button>
    );
  if (status === "scanning")
    return <span className="text-[10px] text-secondary font-mono">SCAN...</span>;
  if (status === "done")
    return <span className="text-[10px] text-primary font-bold">✓ DONE</span>;
  if (status === "empty")
    return <span className="text-[10px] text-muted-foreground">EMPTY</span>;
  return <span className="text-[10px] text-destructive">ERROR</span>;
}

function StreamRow({
  url,
  onCopy,
  copied,
  compact,
  kind,
}: {
  url: string;
  onCopy: (s: string) => void;
  copied: boolean;
  compact?: boolean;
  kind: "stream" | "iframe";
}) {
  const label =
    kind === "iframe"
      ? "IFRAME"
      : /\.m3u8/i.test(url)
        ? "M3U8"
        : /\.mp4/i.test(url)
          ? "MP4"
          : /\.mpd/i.test(url)
            ? "DASH"
            : "PLAYER";
  const isPrimary = label === "M3U8" || label === "DASH";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
          isPrimary
            ? "bg-primary/20 text-primary"
            : "bg-secondary/20 text-secondary"
        }`}
      >
        {label}
      </span>
      <code
        className={`flex-1 truncate ${
          compact ? "text-[11px]" : "text-xs"
        } text-foreground/80 font-mono`}
      >
        {url}
      </code>
      <button
        onClick={() => onCopy(url)}
        className={`text-[10px] px-2 py-1 rounded border transition flex-shrink-0 font-bold ${
          copied
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:text-primary hover:border-primary"
        }`}
      >
        {copied ? "✓" : "COPY"}
      </button>
    </div>
  );
}
