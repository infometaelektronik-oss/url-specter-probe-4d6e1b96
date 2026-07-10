import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Sparkles, Trash2, Tv, Clapperboard, Film, ArrowLeft, Play } from "lucide-react";

import { HlsPlayer } from "../components/HlsPlayer";
import { supabase } from "@/integrations/supabase/client";
import { addPoolSite, listPoolSites, removePoolSite } from "../lib/pool.functions";
import { discoverSites } from "../lib/discover.functions";

type Media = {
  id: string;
  title: string;
  kind: string;
  source_url: string;
  stream_url: string;
  thumbnail: string | null;
  created_at: string;
};

type PoolSite = {
  id: string;
  url: string;
  label: string;
  kind: string;
  active: boolean;
  last_crawled_at: string | null;
  created_at: string;
};

type Suggestion = { url: string; label: string; kind: string };

export const Route = createFileRoute("/havuz")({
  head: () => ({
    meta: [
      { title: "Otonom Havuz — URL Media Crawler" },
      { name: "description", content: "AI destekli 15 dakikada bir tarayan otonom medya havuzu." },
    ],
  }),
  component: HavuzPage,
});

function HavuzPage() {
  const [media, setMedia] = useState<Media[]>([]);
  const [pool, setPool] = useState<PoolSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);

  const listPool = useServerFn(listPoolSites);
  const addPool = useServerFn(addPoolSite);
  const removePool = useServerFn(removePoolSite);
  const discover = useServerFn(discoverSites);

  const refreshMedia = async () => {
    const { data } = await supabase
      .from("media_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setMedia((data ?? []) as Media[]);
  };

  const refreshPool = async () => {
    const r = await listPool();
    if (r.ok) setPool(r.items as PoolSite[]);
  };

  useEffect(() => {
    (async () => {
      await Promise.all([refreshMedia(), refreshPool()]);
      setLoading(false);
    })();
    // Live poll every 8 seconds
    const iv = setInterval(refreshMedia, 8000);
    // Realtime subscription
    const ch = supabase
      .channel("media_items_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "media_items" }, refreshMedia)
      .subscribe();
    return () => {
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const g = { dizi: [] as Media[], film: [] as Media[], canli: [] as Media[], diger: [] as Media[] };
    for (const m of media) {
      const k = m.kind === "canli" ? "canli" : m.kind === "film" ? "film" : m.kind === "dizi" ? "dizi" : "diger";
      g[k as keyof typeof g].push(m);
    }
    return g;
  }, [media]);

  const runCrawlNow = async () => {
    setCrawlBusy(true);
    setCrawlMsg(null);
    try {
      const res = await fetch("/api/public/hooks/auto-crawl", { method: "POST" });
      const j = (await res.json()) as { targets: number; inserted: number };
      setCrawlMsg(`${j.targets} site tarandı, ${j.inserted} yeni akış havuza girdi.`);
      await refreshMedia();
      await refreshPool();
    } catch (e) {
      setCrawlMsg(`Hata: ${(e as Error).message}`);
    } finally {
      setCrawlBusy(false);
    }
  };

  const runDiscover = async () => {
    if (!topic.trim()) return;
    setAiBusy(true);
    setAiErr(null);
    setSuggestions([]);
    try {
      const r = await discover({ data: { topic: topic.trim() } });
      if (!r.ok) setAiErr(r.error);
      else setSuggestions(r.items as Suggestion[]);
    } finally {
      setAiBusy(false);
    }
  };

  const addSuggestion = async (s: Suggestion) => {
    const r = await addPool({ data: { url: s.url, label: s.label, kind: s.kind as "dizi" | "film" | "canli" | "auto" } });
    if (r.ok) {
      setSuggestions((prev) => prev.filter((x) => x.url !== s.url));
      await refreshPool();
    }
  };

  const removeFromPool = async (id: string) => {
    await removePool({ data: { id } });
    await refreshPool();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-orange-400" />
            <div>
              <h1 className="text-lg font-semibold">Otonom Havuz</h1>
              <p className="text-xs text-muted-foreground">
                15 dakikada bir arka planda otomatik tarama · Canlı yayın havuzu
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runCrawlNow}
              disabled={crawlBusy}
              className="inline-flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-60"
            >
              {crawlBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Şimdi tara
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Manuel araç
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {crawlMsg && (
          <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200">
            {crawlMsg}
          </div>
        )}

        {/* AI keşif */}
        <section className="space-y-3 rounded-xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400" />
            <h2 className="text-base font-semibold">AI Keşif</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Bir tür/tema yaz ("Türk polisiye dizileri", "spor kanalları", "romantik komedi filmleri"), AI havuza uygun
            siteler önersin.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="örn. Türk dizileri, canlı futbol, aksiyon filmleri"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500/60"
              onKeyDown={(e) => e.key === "Enter" && runDiscover()}
            />
            <button
              onClick={runDiscover}
              disabled={aiBusy || !topic.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-500/30 disabled:opacity-60"
            >
              {aiBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Öner
            </button>
          </div>
          {aiErr && <p className="text-xs text-red-400">{aiErr}</p>}
          {suggestions.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <li
                  key={s.url}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                    <span className="mt-1 inline-block rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] uppercase text-blue-300">
                      {s.kind}
                    </span>
                  </div>
                  <button
                    onClick={() => addSuggestion(s)}
                    className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-xs text-orange-200 hover:bg-orange-500/20"
                  >
                    <Plus className="h-3 w-3" /> Havuza ekle
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pool yönetimi */}
        <section className="space-y-3 rounded-xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold">Aktif Havuz Siteleri ({pool.length})</h2>
          <p className="text-xs text-muted-foreground">
            Bu listedeki tüm siteler her 15 dakikada bir cron ile otomatik taranır. Hazır 20+ preset her zaman
            taranır — bunlar ek olarak eklediklerin.
          </p>
          {pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz özel site eklenmedi (hazır preset'ler yine çalışıyor).</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {pool.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.url}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Son tarama: {p.last_crawled_at ? new Date(p.last_crawled_at).toLocaleString("tr-TR") : "hiç"}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromPool(p.id)}
                    className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                    aria-label="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Player */}
        {selected && (
          <section className="space-y-3 rounded-xl border border-orange-500/40 bg-orange-500/5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{selected.title}</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Kapat
              </button>
            </div>
            <HlsPlayer src={selected.stream_url} poster={selected.thumbnail ?? undefined} />
            <p className="break-all text-xs text-muted-foreground">{selected.stream_url}</p>
          </section>
        )}

        {/* Media groups */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <>
            <MediaGroup title="Canlı Yayınlar" icon={<Tv className="h-4 w-4" />} items={grouped.canli} onPlay={setSelected} />
            <MediaGroup title="Diziler" icon={<Clapperboard className="h-4 w-4" />} items={grouped.dizi} onPlay={setSelected} />
            <MediaGroup title="Filmler" icon={<Film className="h-4 w-4" />} items={grouped.film} onPlay={setSelected} />
            {grouped.diger.length > 0 && (
              <MediaGroup title="Diğer" icon={<Play className="h-4 w-4" />} items={grouped.diger} onPlay={setSelected} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function MediaGroup({
  title,
  icon,
  items,
  onPlay,
}: {
  title: string;
  icon: React.ReactNode;
  items: Media[];
  onPlay: (m: Media) => void;
}) {
  if (!items.length)
    return (
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          {icon} {title} <span className="text-xs">(0)</span>
        </h3>
        <div className="rounded-md border border-dashed border-border bg-card/30 px-4 py-6 text-xs text-muted-foreground">
          Bu kategoride henüz akış yok — cron 15 dakikada bir doldurur, veya "Şimdi tara" bas.
        </div>
      </section>
    );

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon} {title} <span className="text-xs text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.slice(0, 60).map((m) => (
          <li
            key={m.id}
            className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card/60 transition hover:border-orange-500/50"
            onClick={() => onPlay(m)}
          >
            <div className="aspect-video w-full overflow-hidden bg-background/60">
              {m.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnail} alt={m.title} className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Play className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="space-y-1 p-2">
              <p className="truncate text-xs font-medium">{m.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{new URL(m.source_url).host}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
