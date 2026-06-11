import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  Copy,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { HlsPlayer } from "../components/HlsPlayer";
import { autonomousCrawl } from "../lib/autonomous.functions";
import {
  deleteDeadItems,
  listLibrary,
  reverifyLibrary,
  type LibraryItem,
} from "../lib/library.functions";

const PRESETS = [
  { label: "Kanal D", url: "https://www.kanald.com.tr/diziler" },
  { label: "Star TV", url: "https://www.startv.com.tr/dizi" },
  { label: "Show TV", url: "https://www.showtv.com.tr/diziler" },
  { label: "ATV", url: "https://www.atv.com.tr/diziler" },
  { label: "NOW", url: "https://www.nowtv.com.tr/diziler" },
  { label: "TV8", url: "https://www.tv8.com.tr/diziler" },
  { label: "FOX", url: "https://www.fox.com.tr/diziler" },
  { label: "TRT İzle", url: "https://www.trtizle.com/diziler" },
  { label: "TRT 1 Canlı", url: "https://www.trtizle.com/canli/tv/trt-1" },
  { label: "PuhuTV", url: "https://puhutv.com" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Otonom Medya Kütüphanesi" },
      {
        name: "description",
        content:
          "Tek tıkla URL tara, AI ile dizi-film-canlı yayın olarak organize et, kırık linkleri otomatik ele, kütüphaneye kaydet.",
      },
      { property: "og:title", content: "Otonom Medya Kütüphanesi" },
      {
        property: "og:description",
        content:
          "AI destekli otonom medya keşif ve organizasyon platformu — dizi, film ve canlı yayınları otomatik kategorize et.",
      },
    ],
  }),
  component: IndexPage,
});

type Tab = "dizi" | "film" | "canli";

function IndexPage() {
  const runAutonomous = useServerFn(autonomousCrawl);
  const runList = useServerFn(listLibrary);
  const runReverify = useServerFn(reverifyLibrary);
  const runDeleteDead = useServerFn(deleteDeadItems);

  const [url, setUrl] = useState(PRESETS[0].url);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [tab, setTab] = useState<Tab>("dizi");
  const [playerSrc, setPlayerSrc] = useState("");
  const [playerTitle, setPlayerTitle] = useState("");
  const [search, setSearch] = useState("");

  async function refresh() {
    try {
      const res = await runList();
      setItems(res.items);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAutonomous(target?: string) {
    const candidate = (target ?? url).trim();
    if (!candidate || busy) return;
    setBusy(true);
    setLogs([`[BAŞLADI] ${candidate}`]);
    try {
      const res = await runAutonomous({ data: { url: candidate, deep: true } });
      setLogs(res.log);
      if (res.ok) {
        toast.success(`${res.saved} medya öğesi kütüphaneye eklendi.`);
        await refresh();
      } else {
        toast.error(res.error || "Tarama başarısız.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Sunucu hatası — tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReverify() {
    if (verifying) return;
    setVerifying(true);
    try {
      const res = await runReverify();
      toast.success(`${res.alive}/${res.checked} link canlı.`);
      await refresh();
    } catch {
      toast.error("Doğrulama başarısız.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleCleanDead() {
    try {
      const res = await runDeleteDead();
      if (res.ok) {
        toast.success(`${res.removed} ölü link silindi.`);
        await refresh();
      }
    } catch {
      toast.error("Temizleme başarısız.");
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Link kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı.");
    }
  }

  function play(item: LibraryItem) {
    setPlayerSrc(item.stream_url);
    setPlayerTitle(item.title);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return items.filter(
      (i) =>
        i.kind === tab &&
        (!q ||
          i.title.toLocaleLowerCase("tr").includes(q) ||
          (i.episode_name ?? "").toLocaleLowerCase("tr").includes(q)),
    );
  }, [items, tab, search]);

  const stats = useMemo(() => {
    const dizi = items.filter((i) => i.kind === "dizi").length;
    const film = items.filter((i) => i.kind === "film").length;
    const canli = items.filter((i) => i.kind === "canli").length;
    const alive = items.filter((i) => i.is_alive).length;
    return { dizi, film, canli, alive, total: items.length };
  }, [items]);

  const seriesTree = useMemo(() => {
    if (tab !== "dizi") return [];
    const grouped = new Map<string, Map<number, LibraryItem[]>>();
    for (const item of filtered) {
      const title = item.title.trim() || "Adsız";
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
  }, [filtered, tab]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border/70 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />
              <span>Otonom medya keşif motoru</span>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  Tek tıkla tara, AI organize etsin.
                </h1>
                <p className="text-base text-muted-foreground sm:text-lg">
                  URL gir, sistem sayfayı tarasın, akışları çıkarsın, kırık linkleri elesin ve
                  sonuçları kütüphanene kaydetsin.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 lg:min-w-[400px]">
                <Stat label="Dizi" value={stats.dizi} />
                <Stat label="Film" value={stats.film} />
                <Stat label="Canlı" value={stats.canli} />
                <Stat label="Canlı %" value={stats.total ? Math.round((stats.alive / stats.total) * 100) : 0} suffix="%" />
              </div>
            </div>
          </header>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <label className="flex min-h-14 flex-1 items-center gap-3 rounded-xl border border-border bg-card/70 px-4 shadow-sm">
              <Link2 className="size-4 text-muted-foreground" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAutonomous();
                }}
                placeholder="https://www.kanald.com.tr/diziler"
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              onClick={() => void handleAutonomous()}
              disabled={busy}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Otonom Tara
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setUrl(p.url);
                  void handleAutonomous(p.url);
                }}
                disabled={busy}
                className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card/60 px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          {logs.length > 0 && (
            <div className="mt-6 max-h-40 overflow-y-auto rounded-lg border border-border bg-card/40 p-3 font-mono text-xs text-muted-foreground">
              {logs.map((l, i) => (
                <div key={i} className="leading-relaxed">{l}</div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            <TabBtn active={tab === "dizi"} onClick={() => setTab("dizi")} icon={<Clapperboard className="size-4" />} label="Diziler" count={stats.dizi} />
            <TabBtn active={tab === "film"} onClick={() => setTab("film")} icon={<Play className="size-4" />} label="Filmler" count={stats.film} />
            <TabBtn active={tab === "canli"} onClick={() => setTab("canli")} icon={<Tv className="size-4" />} label="Canlı" count={stats.canli} />
          </div>

          <div className="flex flex-1 items-center gap-2 sm:max-w-md sm:justify-end">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 sm:max-w-xs">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ara..."
                className="h-full w-full bg-transparent text-sm outline-none"
              />
            </label>
            <button
              onClick={() => void handleReverify()}
              disabled={verifying || items.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              title="Tüm linkleri yeniden doğrula"
            >
              {verifying ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Doğrula
            </button>
            <button
              onClick={() => void handleCleanDead()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Ölü linkleri sil"
            >
              <Trash2 className="size-3.5" />
              Temizle
            </button>
          </div>
        </div>

        <div className="mt-6">
          {filtered.length === 0 ? (
            <EmptyState />
          ) : tab === "dizi" ? (
            <SeriesAccordion tree={seriesTree} onPlay={play} onCopy={copy} />
          ) : (
            <CardGrid items={filtered} onPlay={play} onCopy={copy} />
          )}
        </div>
      </section>

      {playerSrc && (
        <PlayerModal title={playerTitle} src={playerSrc} onClose={() => setPlayerSrc("")} />
      )}
    </main>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">
        {value}
        {suffix}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {icon}
      {label}
      <span className={`text-xs ${active ? "opacity-80" : "opacity-60"}`}>({count})</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 py-16 text-center">
      <Sparkles className="size-10 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">
        Henüz bu kategoride içerik yok. Yukarıdan bir URL tarayarak başla.
      </p>
    </div>
  );
}

function CardGrid({
  items,
  onPlay,
  onCopy,
}: {
  items: LibraryItem[];
  onPlay: (i: LibraryItem) => void;
  onCopy: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.id}
          className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={item.title}
                loading="lazy"
                className="size-full object-cover transition-transform group-hover:scale-105"
                onError={(e) => ((e.currentTarget.style.display = "none"))}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground/40">
                <Tv className="size-8" />
              </div>
            )}
            {!item.is_alive && (
              <span className="absolute right-2 top-2 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                ölü
              </span>
            )}
            {item.year && (
              <span className="absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
                {item.year}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</h3>
            <div className="mt-auto flex gap-1">
              <button
                onClick={() => onPlay(item)}
                disabled={!item.is_alive}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Play className="size-3" />
                Oynat
              </button>
              <button
                onClick={() => onCopy(item.stream_url)}
                className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                title="Linki kopyala"
              >
                <Copy className="size-3" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SeriesAccordion({
  tree,
  onPlay,
  onCopy,
}: {
  tree: { title: string; seasons: { season: number; entries: LibraryItem[] }[] }[];
  onPlay: (i: LibraryItem) => void;
  onCopy: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      {tree.map((series) => (
        <details
          key={series.title}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-accent">
            <div className="flex items-center gap-2">
              <Clapperboard className="size-4 text-primary" />
              <span className="font-medium">{series.title}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {series.seasons.reduce((s, sn) => s + sn.entries.length, 0)} bölüm
            </span>
          </summary>
          <div className="border-t border-border bg-background/40 p-3">
            {series.seasons.map((sn) => (
              <div key={sn.season} className="mb-3 last:mb-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {sn.season > 0 ? `Sezon ${sn.season}` : "Bölümler"}
                </div>
                <div className="space-y-1">
                  {sn.entries.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/50"
                    >
                      <div className="flex-1 truncate text-sm">
                        {ep.episode != null && (
                          <span className="mr-2 inline-block min-w-[2rem] rounded bg-muted px-1.5 py-0.5 text-center text-xs font-mono">
                            {ep.episode}
                          </span>
                        )}
                        {ep.episode_name || `Bölüm ${ep.episode ?? "?"}`}
                        {!ep.is_alive && (
                          <span className="ml-2 rounded bg-destructive/90 px-1 py-0.5 text-[10px] text-destructive-foreground">
                            ölü
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onPlay(ep)}
                        disabled={!ep.is_alive}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
                      >
                        <Play className="size-3" />
                      </button>
                      <button
                        onClick={() => onCopy(ep.stream_url)}
                        className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        <Copy className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function PlayerModal({
  title,
  src,
  onClose,
}: {
  title: string;
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="line-clamp-1 text-sm font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 transition-colors hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
        <HlsPlayer src={src} />
      </div>
    </div>
  );
}
