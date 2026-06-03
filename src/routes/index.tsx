import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "URL Media Crawler — Akış Tarama Merkezi" },
      { name: "description", content: "URL üzerinden derinlemesine medya tarama: diziler, kanallar, .m3u8 ve .mp4 akış linklerini cımbızla çek." },
      { property: "og:title", content: "URL Media Crawler" },
      { property: "og:description", content: "Linki ver, akışı al. Tek URL'den derinlemesine medya keşfi." },
    ],
  }),
  component: CrawlerPage,
});

const PROXY = "https://api.allorigins.win/raw?url=";

type SeriesItem = {
  id: string;
  name: string;
  link: string;
  thumb?: string;
  status: "pending" | "scanning" | "done" | "empty" | "error";
  streams: string[];
};

function absUrl(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function extractFromHtml(html: string, baseUrl: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // streams
  const streamSet = new Set<string>();
  const streamRegex = /https?:\/\/[^\s'"<>()]+?\.(?:m3u8|mp4)(?:\?[^\s'"<>()]*)?/gi;
  let m;
  while ((m = streamRegex.exec(html)) !== null) streamSet.add(m[0]);
  // also relative .m3u8 in source/video tags
  doc.querySelectorAll("source[src], video[src]").forEach((el) => {
    const s = el.getAttribute("src");
    if (s && /\.(m3u8|mp4)/i.test(s)) {
      const abs = absUrl(s, baseUrl);
      if (abs) streamSet.add(abs);
    }
  });

  // link items
  const baseHost = new URL(baseUrl).host;
  const items: Omit<SeriesItem, "status" | "streams">[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) return;
    const abs = absUrl(href, baseUrl);
    if (!abs) return;
    let u: URL;
    try { u = new URL(abs); } catch { return; }
    if (u.host !== baseHost) return;
    // heuristic: deeper than root, not the same as base
    if (u.pathname === "/" || u.pathname === new URL(baseUrl).pathname) return;
    if (seen.has(abs)) return;

    // name
    const text = (a.textContent || "").trim().replace(/\s+/g, " ");
    const img = a.querySelector("img");
    const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || img?.getAttribute("data-original");
    const title = a.getAttribute("title") || img?.getAttribute("alt") || text;
    if (!title || title.length < 2 || title.length > 80) return;

    // filter to "content-like" links: must have at least 2 path segments OR an image
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

  // og:image fallback
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");

  return { items: items.slice(0, 60), streams: Array.from(streamSet), ogImage };
}

async function fetchViaProxy(url: string): Promise<string> {
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`Proxy ${res.status}`);
  return await res.text();
}

function CrawlerPage() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [rootStreams, setRootStreams] = useState<string[]>([]);
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [deepRunning, setDeepRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setItems([]);
    setRootStreams([]);
    if (!url.trim()) return;
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    setScanning(true);
    setStatus("Ana sayfa yakalanıyor...");
    try {
      const html = await fetchViaProxy(target);
      setStatus("Linkler çıkarılıyor...");
      const { items: found, streams } = extractFromHtml(html, target);
      setRootStreams(streams);
      setItems(found.map((f) => ({ ...f, status: "pending", streams: [] })));
      setStatus(`${found.length} alt sayfa tespit edildi.`);
    } catch (err) {
      setError((err as Error).message || "Tarama başarısız.");
      setStatus("");
    } finally {
      setScanning(false);
    }
  }

  async function resolveOne(item: SeriesItem) {
    setItems((prev) => prev.map((p) => p.id === item.id ? { ...p, status: "scanning" } : p));
    try {
      const html = await fetchViaProxy(item.link);
      const { streams, ogImage } = extractFromHtml(html, item.link);
      setItems((prev) => prev.map((p) => p.id === item.id ? {
        ...p,
        status: streams.length ? "done" : "empty",
        streams,
        thumb: p.thumb || ogImage || undefined,
      } : p));
    } catch {
      setItems((prev) => prev.map((p) => p.id === item.id ? { ...p, status: "error" } : p));
    }
  }

  async function deepCrawl() {
    setDeepRunning(true);
    const pending = items.filter((i) => i.status === "pending");
    // limit concurrency
    const queue = [...pending];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (!next) break;
        await resolveOne(next);
      }
    });
    await Promise.all(workers);
    setDeepRunning(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
    });
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const totalStreams = items.reduce((n, i) => n + i.streams.length, 0) + rootStreams.length;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, oklch(0.22 0.04 260) 0%, transparent 60%)" }} />

      <header className="relative z-10 px-6 py-6 flex items-center justify-between border-b border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-neon)" }}>
            <span className="font-black text-lg text-primary-foreground">⌬</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">URL MEDIA CRAWLER</h1>
            <p className="text-xs text-muted-foreground">Deep Stream Discovery Engine</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />PROXY ONLINE</span>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 sm:py-16">
        <section className="text-center mb-10">
          <div className="inline-block px-3 py-1 rounded-full border border-border bg-card/60 backdrop-blur text-xs text-muted-foreground mb-4">
            Sadece URL · Manuel HTML yok · Anlık çözümleme
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
            Linki ver, <span className="text-gradient">akışı al.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Bir platform sayfası adresi gir; sistem proxy üzerinden tarayıp dizi/kanal alt sayfalarını ve gizli <code className="text-primary">.m3u8</code> / <code className="text-secondary">.mp4</code> akışlarını çıkarır.
          </p>
        </section>

        <form onSubmit={handleScan} className="relative mb-8">
          <div className={`relative rounded-2xl bg-card/80 backdrop-blur border border-border p-2 flex flex-col sm:flex-row gap-2 ${scanning ? "animate-pulse-glow" : ""}`} style={{ boxShadow: "var(--shadow-neon)" }}>
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
              ) : "PLATFORMU TARA"}
            </button>
          </div>
          {status && <p className="text-xs text-muted-foreground mt-3 text-center font-mono">› {status}</p>}
          {error && <p className="text-sm text-destructive mt-3 text-center">⚠ {error}</p>}
        </form>

        {scanning && (
          <div className="flex items-center justify-center py-16">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary animate-orbit" />
              <div className="absolute inset-3 rounded-full border-2 border-secondary/30 border-b-secondary animate-orbit" style={{ animationDirection: "reverse", animationDuration: "3s" }} />
              <div className="absolute inset-7 rounded-full border-2 border-primary/40 border-l-primary animate-orbit" style={{ animationDuration: "2s" }} />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">SCAN</div>
            </div>
          </div>
        )}

        {(items.length > 0 || rootStreams.length > 0) && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-card/60 border border-border backdrop-blur">
              <div className="flex gap-6 text-sm">
                <Stat label="ALT SAYFA" value={items.length} color="primary" />
                <Stat label="ÇÖZÜLEN" value={doneCount} color="secondary" />
                <Stat label="AKIŞ LİNKİ" value={totalStreams} color="primary" />
              </div>
              <button
                onClick={deepCrawl}
                disabled={deepRunning || items.every((i) => i.status !== "pending")}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-secondary/50 text-secondary hover:bg-secondary/10 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deepRunning && <span className="w-3 h-3 border-2 border-secondary/30 border-t-secondary rounded-full animate-orbit" />}
                İÇERİĞİ ÇÖZ (DEEP CRAWL)
              </button>
            </div>

            {rootStreams.length > 0 && (
              <div className="p-4 rounded-xl border border-primary/40 bg-primary/5">
                <h3 className="text-sm font-bold text-primary mb-3">⚡ Ana sayfadan yakalanan akışlar ({rootStreams.length})</h3>
                <div className="space-y-2">
                  {rootStreams.map((s) => (
                    <StreamRow key={s} url={s} onCopy={copy} copied={copied === s} />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card/60 backdrop-blur overflow-hidden">
              <div className="grid grid-cols-12 text-xs font-bold text-muted-foreground uppercase tracking-wider px-4 py-3 border-b border-border bg-muted/40">
                <div className="col-span-1">#</div>
                <div className="col-span-4 sm:col-span-3">Dizi / Kanal</div>
                <div className="hidden sm:block col-span-3">Platform Linki</div>
                <div className="col-span-5">Canlı Akış</div>
                <div className="col-span-2 text-right">Durum</div>
              </div>
              <div className="divide-y divide-border">
                {items.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 px-4 py-3 items-center gap-2 hover:bg-muted/20 transition">
                    <div className="col-span-1 font-mono text-xs text-muted-foreground">{String(idx + 1).padStart(2, "0")}</div>
                    <div className="col-span-4 sm:col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-md bg-muted overflow-hidden flex-shrink-0 border border-border">
                        {item.thumb ? (
                          <img src={item.thumb} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">▢</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground truncate sm:hidden">{new URL(item.link).pathname}</div>
                      </div>
                    </div>
                    <div className="hidden sm:block col-span-3 text-xs text-muted-foreground truncate font-mono">
                      <a href={item.link} target="_blank" rel="noreferrer" className="hover:text-secondary">{new URL(item.link).pathname}</a>
                    </div>
                    <div className="col-span-5 space-y-1 min-w-0">
                      {item.streams.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          {item.status === "pending" && "— bekliyor —"}
                          {item.status === "scanning" && "çözülüyor..."}
                          {item.status === "empty" && "akış bulunamadı"}
                          {item.status === "error" && "hata"}
                        </span>
                      ) : item.streams.map((s) => (
                        <StreamRow key={s} url={s} onCopy={copy} copied={copied === s} compact />
                      ))}
                    </div>
                    <div className="col-span-2 text-right">
                      <StatusBadge status={item.status} onResolve={() => resolveOne(item)} />
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">Henüz alt sayfa yok.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {!scanning && items.length === 0 && rootStreams.length === 0 && !error && (
          <div className="text-center text-xs text-muted-foreground mt-12 font-mono">
            <p>Örnek: <button onClick={() => setUrl("https://www.kanald.com.tr/diziler")} className="text-secondary hover:text-primary underline">kanald.com.tr/diziler</button> · <button onClick={() => setUrl("https://www.atv.com.tr/diziler")} className="text-secondary hover:text-primary underline">atv.com.tr/diziler</button></p>
          </div>
        )}
      </main>

      <footer className="relative z-10 text-center text-xs text-muted-foreground py-6 border-t border-border/50">
        Proxy: api.allorigins.win · Tüm tarama tarayıcı tarafında çalışır.
      </footer>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "primary" | "secondary" }) {
  return (
    <div>
      <div className={`text-2xl font-black ${color === "primary" ? "text-primary" : "text-secondary"}`}>{value}</div>
      <div className="text-[10px] font-bold text-muted-foreground tracking-widest">{label}</div>
    </div>
  );
}

function StatusBadge({ status, onResolve }: { status: SeriesItem["status"]; onResolve: () => void }) {
  if (status === "pending") return (
    <button onClick={onResolve} className="text-[10px] px-2 py-1 rounded border border-primary/50 text-primary hover:bg-primary/10 transition font-bold">ÇÖZ</button>
  );
  if (status === "scanning") return <span className="text-[10px] text-secondary font-mono">SCAN...</span>;
  if (status === "done") return <span className="text-[10px] text-primary font-bold">✓ DONE</span>;
  if (status === "empty") return <span className="text-[10px] text-muted-foreground">EMPTY</span>;
  return <span className="text-[10px] text-destructive">ERROR</span>;
}

function StreamRow({ url, onCopy, copied, compact }: { url: string; onCopy: (s: string) => void; copied: boolean; compact?: boolean }) {
  const isM3u8 = /\.m3u8/i.test(url);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${isM3u8 ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"}`}>
        {isM3u8 ? "M3U8" : "MP4"}
      </span>
      <code className={`flex-1 truncate ${compact ? "text-[11px]" : "text-xs"} text-foreground/80 font-mono`}>{url}</code>
      <button
        onClick={() => onCopy(url)}
        className={`text-[10px] px-2 py-1 rounded border transition flex-shrink-0 font-bold ${copied ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-primary hover:border-primary"}`}
      >
        {copied ? "✓ KOPYALANDI" : "COPY"}
      </button>
    </div>
  );
}
