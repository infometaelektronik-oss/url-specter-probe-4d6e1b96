import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  LoaderCircle,
  Play,
  RefreshCw,
  Radio,
  Search,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  getChoicelyConfigStatus,
  getScraperStats,
  triggerDiscovery,
  triggerHealth,
} from "../lib/scraper/actions.functions";

type Stream = {
  id: string;
  title: string;
  type: string;
  category: string | null;
  stream_url: string;
  poster_image_url: string | null;
  resolution: string | null;
  source: string | null;
  status: string;
  failure_count: number;
  is_active: boolean;
  last_checked_at: string | null;
  last_pushed_at: string | null;
  updated_at: string;
};

type LogRow = {
  id: number;
  level: string;
  phase: string;
  message: string;
  created_at: string;
};

export const Route = createFileRoute("/otonom")({
  head: () => ({
    meta: [
      { title: "Otonom Kazıcı — Zero-Input Stream Scraper" },
      { name: "description", content: "İnsan müdahalesiz otonom canlı yayın & film/dizi kazıyıcı — Choicely push." },
    ],
  }),
  component: OtonomPage,
});

function OtonomPage() {
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, todayNew: 0, killedToday: 0 });
  const [streams, setStreams] = useState<Stream[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [choicelyStatus, setChoicelyStatus] = useState({ hasUrl: false, hasKey: false });

  const discoverFn = useServerFn(triggerDiscovery);
  const healthFn = useServerFn(triggerHealth);
  const statsFn = useServerFn(getScraperStats);
  const choicelyStatusFn = useServerFn(getChoicelyConfigStatus);

  const refreshStreams = async () => {
    const { data } = await supabase
      .from("autonomous_streams")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(300);
    setStreams((data ?? []) as Stream[]);
  };
  const refreshLogs = async () => {
    const { data } = await supabase
      .from("scraper_logs")
      .select("*")
      .order("id", { ascending: false })
      .limit(60);
    setLogs((data ?? []) as LogRow[]);
  };
  const refreshStats = async () => {
    const r = await statsFn();
    if (r.ok) setStats(r.stats);
  };

  useEffect(() => {
    void refreshStreams();
    void refreshLogs();
    void refreshStats();
    choicelyStatusFn().then(setChoicelyStatus);
    const iv = setInterval(() => {
      void refreshStreams();
      void refreshLogs();
      void refreshStats();
    }, 6000);
    const ch = supabase
      .channel("otonom_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "autonomous_streams" }, refreshStreams)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scraper_logs" }, refreshLogs)
      .subscribe();
    return () => {
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDiscover = async () => {
    setDiscoverBusy(true);
    setMsg(null);
    try {
      const r = await discoverFn();
      setMsg(`Keşif tamam: ${r.summary.inserted} yeni · ${r.summary.updated} güncel · ${r.summary.pushed} Choicely'e gitti · ${r.summary.pages} sayfa tarandı.`);
    } catch (e) {
      setMsg(`Hata: ${(e as Error).message}`);
    } finally {
      setDiscoverBusy(false);
      void refreshStreams();
      void refreshStats();
    }
  };
  const runHealth = async () => {
    setHealthBusy(true);
    setMsg(null);
    try {
      const r = await healthFn();
      setMsg(`Sağlık tarama tamam: ${r.summary.checked} kontrol · ${r.summary.killed} elendi · ${r.summary.removedFromChoicely} Choicely'den silindi.`);
    } catch (e) {
      setMsg(`Hata: ${(e as Error).message}`);
    } finally {
      setHealthBusy(false);
      void refreshStats();
      void refreshStreams();
    }
  };

  const categories = useMemo(() => {
    const s = new Set<string>();
    streams.forEach((x) => x.category && s.add(x.category));
    return ["all", ...Array.from(s).sort()];
  }, [streams]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return streams.filter((s) => {
      if (catFilter !== "all" && s.category !== catFilter) return false;
      if (!needle) return true;
      return (
        s.title.toLowerCase().includes(needle) ||
        (s.source ?? "").toLowerCase().includes(needle) ||
        s.stream_url.toLowerCase().includes(needle)
      );
    });
  }, [streams, q, catFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Cpu className="h-6 w-6 text-orange-400" />
            <div>
              <h1 className="text-lg font-semibold">Zero-Input Otonom Kazıcı</h1>
              <p className="text-[11px] text-muted-foreground">
                Dorking · OSINT · Regex Extract · AI Classify · Health-Check · Choicely Push
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runDiscover}
              disabled={discoverBusy}
              className="inline-flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-60"
            >
              {discoverBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Otonom Kazıcıyı Şimdi Başlat
            </button>
            <button
              onClick={runHealth}
              disabled={healthBusy}
              className="inline-flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
            >
              {healthBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sağlık Tara
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Ana
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6">
        {msg && (
          <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200">
            {msg}
          </div>
        )}

        {/* Choicely entegrasyon durumu */}
        <section className="rounded-lg border border-border bg-card/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Choicely Entegrasyon</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`rounded border px-3 py-2 ${choicelyStatus.hasUrl ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
              CHOICELY_API_URL: {choicelyStatus.hasUrl ? "✓ Yüklü" : "× Eksik"}
            </div>
            <div className={`rounded border px-3 py-2 ${choicelyStatus.hasKey ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
              CHOICELY_API_KEY: {choicelyStatus.hasKey ? "✓ Yüklü" : "× Eksik"}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            URL / Key güvenli secret olarak saklanıyor. Değiştirmek için chat'ten "Choicely secret'larını güncelle" de.
          </p>
        </section>

        {/* İstatistikler */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard icon={<Radio className="h-5 w-5" />} label="Toplam Akış" value={stats.total} color="orange" />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Aktif" value={stats.active} color="green" />
          <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Elenmiş" value={stats.inactive} color="red" />
          <StatCard icon={<Activity className="h-5 w-5" />} label="Bugün Yeni" value={stats.todayNew} color="blue" />
          <StatCard icon={<Trash2 className="h-5 w-5" />} label="Bugün Elendi" value={stats.killedToday} color="amber" />
        </section>

        {/* Live log */}
        <section className="rounded-lg border border-border bg-black/60 p-4 font-mono">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Terminal className="h-4 w-4" /> Canlı Kazıyıcı Log (son 60)
          </div>
          <div className="max-h-64 space-y-0.5 overflow-auto text-[11px]">
            {logs.length === 0 && <p className="text-muted-foreground">Henüz log yok. "Şimdi Başlat"a bas.</p>}
            {logs.map((l) => (
              <div
                key={l.id}
                className={
                  l.level === "error"
                    ? "text-red-400"
                    : l.level === "warn"
                      ? "text-amber-400"
                      : l.level === "ok"
                        ? "text-emerald-400"
                        : "text-slate-300"
                }
              >
                <span className="text-slate-500">
                  [{new Date(l.created_at).toLocaleTimeString("tr-TR")}]
                </span>{" "}
                <span className="text-slate-500">[{l.phase}]</span> {l.message}
              </div>
            ))}
          </div>
        </section>

        {/* Filtre + liste */}
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Başlık, kaynak, URL ara…"
                className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-500/60"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Tüm kategoriler" : c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 120).map((s) => (
              <article
                key={s.id}
                className={`rounded-lg border p-3 text-sm ${s.status === "active" ? "border-border bg-card/60" : "border-red-500/30 bg-red-500/5 opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  {s.poster_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.poster_image_url} alt="" className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded bg-background/60 text-muted-foreground">
                      <Play className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.source}</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-orange-300">{s.type}</span>
                      {s.category && (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-blue-300">{s.category}</span>
                      )}
                      {s.resolution && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">{s.resolution}</span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 ${s.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
                      >
                        {s.status}
                      </span>
                      {s.failure_count > 0 && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                          fail: {s.failure_count}
                        </span>
                      )}
                      {s.last_pushed_at && (
                        <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300">→ Choicely</span>
                      )}
                    </div>
                    <p className="mt-1 break-all text-[10px] text-muted-foreground">{s.stream_url}</p>
                  </div>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                Henüz kayıt yok. Yukarıdan "Otonom Kazıcıyı Şimdi Başlat" ile ilk turu tetikle.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "orange" | "green" | "red" | "blue" | "amber";
}) {
  const map = {
    orange: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  } as const;
  return (
    <div className={`rounded-lg border p-3 ${map[color]}`}>
      <div className="flex items-center gap-2 text-xs opacity-90">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
