import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity, Boxes, Globe2, Loader2, KeyRound, LogOut, Play, RefreshCw, Radio, Rss, Shield,
  Trash2, Waves, Webhook,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addEpgSource, addProxy, addQuery, addWebhook, claimAdmin, createApiClient, getOverview,
  getResources, listStreams, runEngine, testWebhooks, toggleResource, updateStream,
} from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/console")({
  head: () => ({
    meta: [
      { title: "Kontrol Konsolu — Core Stream Engine" },
      { name: "description", content: "Motor durumu, akışlar, API istemcileri, proxy havuzu ve bildirimler tek ekranda." },
      { property: "og:title", content: "Kontrol Konsolu — Core Stream Engine" },
      { property: "og:description", content: "Motor durumu, akışlar, API istemcileri, proxy havuzu ve bildirimler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Console,
});

const TABS = [
  { id: "overview", label: "Genel", icon: Activity },
  { id: "streams", label: "Akışlar", icon: Waves },
  { id: "discovery", label: "Keşif", icon: Globe2 },
  { id: "api", label: "API", icon: KeyRound },
  { id: "network", label: "Proxy", icon: Shield },
  { id: "integrations", label: "Bildirim & EPG", icon: Webhook },
] as const;

function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="surface rounded-2xl p-5">
      {title && (
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const inputCls = "w-full rounded-lg border border-input bg-input px-3 py-2 text-sm outline-none focus:border-primary";
const btnCls = "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ghostCls = "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:border-primary/60 hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Console() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const claim = useServerFn(claimAdmin);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    claim({})
      .then((r) => { setReady(true); if (!r.isAdmin) setDenied(true); })
      .catch(() => { setReady(true); setDenied(true); });
  }, [claim]);

  const overview = useQuery({ queryKey: ["overview"], queryFn: () => getOverview(), enabled: ready && !denied, refetchInterval: 15000 });
  const resources = useQuery({ queryKey: ["resources"], queryFn: () => getResources(), enabled: ready && !denied });

  const run = useMutation({
    mutationFn: (task: "discover" | "worker" | "health" | "epg") => runEngine({ data: { task } }),
    onSuccess: (r) => { toast.success(`${r.task} tamamlandı`, { description: JSON.stringify(r.result) }); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ready) return <div className="grid min-h-screen place-items-center text-muted-foreground">Yükleniyor…</div>;
  if (denied)
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Yetkin yok</h1>
          <p className="mt-2 text-sm text-muted-foreground">Bu konsolu yalnızca yönetici hesabı açabilir.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-bold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Core Stream <span className="text-gradient">Engine</span>
          </div>
          <nav className="ml-4 flex flex-1 gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: I }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                <I className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
          <button className={ghostCls} onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap gap-2">
          <button className={btnCls} disabled={run.isPending} onClick={() => run.mutate("discover")}>{run.isPending && run.variables === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Keşfet</button>
          <button className={ghostCls} disabled={run.isPending} onClick={() => run.mutate("worker")}>{run.isPending && run.variables === "worker" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />} Kuyruğu işle</button>
          <button className={ghostCls} disabled={run.isPending} onClick={() => run.mutate("health")}>{run.isPending && run.variables === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Sağlık taraması</button>
          <button className={ghostCls} disabled={run.isPending} onClick={() => run.mutate("epg")}>{run.isPending && run.variables === "epg" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rss className="h-4 w-4" />} EPG senkronu</button>
          <button className={ghostCls} disabled={overview.isFetching} onClick={() => qc.invalidateQueries()}><RefreshCw className={`h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} /> Yenile</button>
        </div>

        {(overview.error || resources.error) && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <b className="text-destructive">Veriler alınamadı:</b> {(overview.error ?? resources.error)?.message}
            <button className={ghostCls + " ml-3"} onClick={() => { void overview.refetch(); void resources.refetch(); }}>Tekrar dene</button>
          </div>
        )}
        {tab === "overview" && <Overview data={overview.data} />}
        {tab === "streams" && <Streams />}
        {tab === "discovery" && <Discovery data={resources.data} />}
        {tab === "api" && <ApiTab data={resources.data} />}
        {tab === "network" && <Network data={resources.data} />}
        {tab === "integrations" && <Integrations data={resources.data} />}
      </main>
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof getOverview>>;

function Overview({ data }: { data?: Overview }) {
  if (!data) return <Card><div className="text-sm text-muted-foreground">Veriler yükleniyor…</div></Card>;
  const stats = [
    { l: "Toplam akış", v: data.counts.total },
    { l: "Aktif", v: data.counts.active },
    { l: "Elenen", v: data.counts.inactive },
    { l: "Kuyrukta", v: data.counts.queued },
    { l: "Başarısız görev (24s)", v: data.counts.failedJobs },
  ];
  const last = data.metrics[data.metrics.length - 1];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.l} className="surface rounded-xl p-4">
            <div className="font-mono text-3xl font-bold text-primary">{s.v}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Son tur telemetrisi">
          {last ? (
            <dl className="space-y-2 font-mono text-sm">
              {[["İstek", last.requests], ["Başarılı", last.success], ["Engellenen", last.banned], ["Ort. yanıt", `${last.avg_ms} ms`], ["Yeni kayıt", last.found]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between border-b border-border/50 pb-1">
                  <dt className="text-muted-foreground">{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="text-sm text-muted-foreground">Henüz tur çalışmadı.</p>}
        </Card>

        <Card title="Kalite dağılımı">
          <div className="space-y-2">
            {Object.entries(data.tiers).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><span>{k}</span><span className="font-mono text-muted-foreground">{v}</span></div>
                <div className="mt-1 h-1.5 rounded bg-muted">
                  <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, (v / Math.max(1, data.counts.active)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Kategoriler">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.categories).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => (
              <span key={k} className="rounded-full border border-border px-2 py-1 text-xs">{k} <span className="font-mono text-primary">{v}</span></span>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Canlı kayıtlar">
        <div className="max-h-96 overflow-auto rounded-lg bg-background/60 p-3 font-mono text-xs">
          {data.logs.map((l) => (
            <div key={l.id} className="flex gap-2 border-b border-border/30 py-1">
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleTimeString("tr-TR")}</span>
              <span className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-primary" : l.level === "ok" ? "text-secondary" : "text-muted-foreground"}>[{l.phase}]</span>
              <span>{l.message}</span>
            </div>
          ))}
          {!data.logs.length && <div className="text-muted-foreground">Kayıt yok.</div>}
        </div>
      </Card>
    </>
  );
}

function Streams() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const streams = useQuery({ queryKey: ["streams", q, tier], queryFn: () => listStreams({ data: { q: q || undefined, tier: tier || undefined } }) });
  const upd = useMutation({
    mutationFn: (v: { id: string; priority?: number; status?: "active" | "inactive"; remove?: boolean }) => updateStream({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["streams"] }); toast.success("Güncellendi"); },
  });

  return (
    <Card title="Akış havuzu" right={
      <div className="flex gap-2">
        <input className={inputCls + " w-48"} placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls + " w-28"} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Tümü</option><option value="FHD">FHD</option><option value="HD">HD</option><option value="SD">SD</option><option value="AUDIO">Ses</option>
        </select>
      </div>
    }>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Başlık</th><th>Kategori</th><th>Kalite</th><th>Bitrate</th><th>Yanıt</th><th>Durum</th><th>Kaynak</th><th /></tr>
          </thead>
          <tbody>
            {(streams.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border/40">
                <td className="max-w-xs truncate py-2 font-medium">{s.title}</td>
                <td className="text-muted-foreground">{s.category}</td>
                <td><span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs text-primary">{s.quality_tier ?? "-"}</span></td>
                <td className="font-mono text-xs text-muted-foreground">{s.bitrate_kbps ? `${s.bitrate_kbps} kbps` : "-"}</td>
                <td className="font-mono text-xs text-muted-foreground">{s.response_ms ? `${s.response_ms}ms` : "-"}</td>
                <td className={s.status === "active" ? "text-secondary" : "text-destructive"}>{s.status}</td>
                <td className="max-w-[9rem] truncate text-xs text-muted-foreground">{s.source}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="px-2 text-xs text-muted-foreground hover:text-primary" onClick={() => upd.mutate({ id: s.id, status: s.status === "active" ? "inactive" : "active" })}>
                    {s.status === "active" ? "Durdur" : "Aç"}
                  </button>
                  <button className="px-2 text-xs text-muted-foreground hover:text-primary" onClick={() => upd.mutate({ id: s.id, priority: (s.priority ?? 0) + 10 })}>Öne al</button>
                  <button className="px-2 text-destructive" onClick={() => upd.mutate({ id: s.id, remove: true })}><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!streams.data?.length && <p className="py-6 text-center text-sm text-muted-foreground">Kayıt yok.</p>}
      </div>
    </Card>
  );
}

type Resources = Awaited<ReturnType<typeof getResources>>;

function Discovery({ data }: { data?: Resources }) {
  const qc = useQueryClient();
  const [engine, setEngine] = useState("duckduckgo");
  const [query, setQuery] = useState("");
  const add = useMutation({
    mutationFn: () => addQuery({ data: { engine: engine as "duckduckgo" | "github", query } }),
    onSuccess: () => { setQuery(""); qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Sorgu eklendi"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => toggleResource({ data: { table: "discovery_queries", id, remove: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
  return (
    <Card title="Keşif sorguları">
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={inputCls + " w-40"} value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="duckduckgo">DuckDuckGo</option><option value="github">GitHub</option>
        </select>
        <input className={inputCls + " flex-1 min-w-48"} placeholder='örn: intitle:"index of" .m3u8' value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={btnCls} disabled={!query || add.isPending} onClick={() =>{add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} add.mutate()}>Ekle</button>
      </div>
      <div className="max-h-[28rem] space-y-1 overflow-auto">
        {(data?.queries ?? []).map((q) => (
          <div key={q.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{q.engine}</span>
            <span className="flex-1 truncate">{q.query}</span>
            <span className="font-mono text-xs text-muted-foreground">{q.hit_count ?? 0} isabet</span>
            <button className="text-destructive" onClick={() => del.mutate(q.id)}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ApiTab({ data }: { data?: Resources }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ips, setIps] = useState("");
  const [rate, setRate] = useState(120);
  const [newKey, setNewKey] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createApiClient({ data: { name, ips, rate } }),
    onSuccess: (r) => { setNewKey(r.key); setName(""); setIps(""); qc.invalidateQueries({ queryKey: ["resources"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => toggleResource({ data: { table: "api_clients", id, remove: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="API istemcisi oluştur">
        <div className="space-y-3">
          <input className={inputCls} placeholder="İstemci adı (örn. Ana IPTV paneli)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="İzinli IP'ler (virgülle, boş = hepsi)" value={ips} onChange={(e) => setIps(e.target.value)} />
          <input className={inputCls} type="number" min={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} placeholder="Dakikalık istek limiti" />
          <button className={btnCls} disabled={!name || create.isPending} onClick={() =>{create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} create.mutate()}><KeyRound className="h-4 w-4" /> Anahtar üret</button>
        </div>
        {newKey && (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3">
            <p className="text-xs text-muted-foreground">Bu anahtar yalnız bir kez gösterilir:</p>
            <code className="mt-1 block break-all font-mono text-sm text-primary">{newKey}</code>
            <button className={ghostCls + " mt-2"} onClick={() => { void navigator.clipboard.writeText(newKey); toast.success("Kopyalandı"); }}>Kopyala</button>
          </div>
        )}
        <div className="mt-5 space-y-1">
          {(data?.clients ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{c.name}</span>
              <code className="font-mono text-xs text-muted-foreground">{c.key_prefix}…</code>
              <span className="font-mono text-xs text-muted-foreground">{c.request_count} istek</span>
              <button className="text-destructive" onClick={() => del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Besleme uçları">
        <p className="text-sm text-muted-foreground">Anahtarı <code className="font-mono text-primary">x-api-key</code> başlığında ya da <code className="font-mono text-primary">?key=</code> ile gönder.</p>
        <div className="mt-3 space-y-2 font-mono text-xs">
          {[
            ["JSON liste", `${origin}/api/public/v1/streams?type=live_tv&quality=FHD`],
            ["M3U playlist", `${origin}/api/public/v1/playlist.m3u?type=live_tv`],
            ["M3U (proxy'li)", `${origin}/api/public/v1/playlist.m3u?type=live_tv&proxied=1`],
            ["EPG (XMLTV)", `${origin}/api/public/v1/epg.xml`],
          ].map(([l, u]) => (
            <div key={l} className="rounded-lg border border-border/40 p-2">
              <div className="mb-1 text-[11px] uppercase text-muted-foreground">{l}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-primary">{u}</code>
                <button className="shrink-0 text-muted-foreground hover:text-primary" onClick={() => { void navigator.clipboard.writeText(u); toast.success("Kopyalandı"); }}>kopyala</button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Proxy'li playlist, gerekli başlık ve token'ları her istekte yeniden yazar; ana kaynak düşerse yedeğe geçer.
        </p>
      </Card>
    </div>
  );
}

function Network({ data }: { data?: Resources }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState("");
  const [country, setCountry] = useState("");
  const add = useMutation({
    mutationFn: () => addProxy({ data: { label, template, country: country || undefined } }),
    onSuccess: () => { setLabel(""); setTemplate(""); setCountry(""); qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Proxy eklendi"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => toggleResource({ data: { table: "proxies", id, remove: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Proxy havuzu">
        <p className="mb-3 text-sm text-muted-foreground">
          Proxy adresini şablon olarak gir: <code className="font-mono text-primary">{"https://saglayici/?country={country}&url={url}"}</code>.
          Havuz boşken motor doğrudan bağlanır; proxy eklediğin an rotasyon ve ülke yönlendirme devreye girer.
        </p>
        <div className="space-y-3">
          <input className={inputCls} placeholder="Etiket" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className={inputCls} placeholder="https://… {url}" value={template} onChange={(e) => setTemplate(e.target.value)} />
          <input className={inputCls} placeholder="Ülke kodu (TR, DE…) — opsiyonel" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          <button className={btnCls} disabled={!label || !template || add.isPending} onClick={() =>{add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} add.mutate()}>Ekle</button>
        </div>
        <div className="mt-5 space-y-1">
          {(data?.proxies ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
              <Globe2 className="h-4 w-4 text-secondary" />
              <span className="flex-1 truncate">{p.label}{p.country ? ` · ${p.country}` : ""}</span>
              <span className="font-mono text-xs text-secondary">{p.success_count}</span>
              <span className="font-mono text-xs text-destructive">{p.ban_count}</span>
              <button className="text-destructive" onClick={() => del.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {!data?.proxies.length && <p className="text-sm text-muted-foreground">Havuz boş — motor doğrudan bağlanıyor.</p>}
        </div>
      </Card>

      <Card title="Challenge çözücü">
        <p className="text-sm text-muted-foreground">
          Cloudflare Turnstile, reCAPTCHA ve hCaptcha engelleri otomatik çözülür. Çalışması için bir çözücü servis anahtarı
          (<span className="text-primary">CAPTCHA_API_KEY</span>) kayıtlı olmalı.
        </p>
        <div className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${data?.captchaReady ? "bg-secondary/15 text-secondary" : "bg-muted text-muted-foreground"}`}>
          <Shield className="h-4 w-4" /> {data?.captchaReady ? "Çözücü aktif" : "Anahtar bekleniyor — engel tespiti çalışıyor, çözüm devre dışı"}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Kimlik rotasyonu (tarayıcı, mobil, Smart TV, Android TV, oynatıcı profilleri) her istekte otomatik çalışır; ayar gerekmez.
        </p>
      </Card>
    </div>
  );
}

function Integrations({ data }: { data?: Resources }) {
  const qc = useQueryClient();
  const [w, setW] = useState({ name: "", kind: "discord", url: "", chatId: "" });
  const [epgUrl, setEpgUrl] = useState("");
  const addHook = useMutation({
    mutationFn: () => addWebhook({ data: { name: w.name, kind: w.kind as "discord" | "telegram" | "generic", url: w.url, chatId: w.chatId || undefined } }),
    onSuccess: () => { setW({ name: "", kind: "discord", url: "", chatId: "" }); qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("Bildirim kanalı eklendi"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({ mutationFn: () => testWebhooks({}), onSuccess: () => toast.success("Test gönderildi") });
  const addEpg = useMutation({
    mutationFn: () => addEpgSource({ data: { url: epgUrl } }),
    onSuccess: () => { setEpgUrl(""); qc.invalidateQueries({ queryKey: ["resources"] }); toast.success("EPG kaynağı eklendi"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delHook = useMutation({ mutationFn: (id: string) => toggleResource({ data: { table: "webhooks", id, remove: true } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }) });
  const delEpg = useMutation({ mutationFn: (id: string) => toggleResource({ data: { table: "epg_sources", id, remove: true } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }) });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Anlık bildirimler" right={<button className={ghostCls} disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Test et</button>}>
        <div className="space-y-3">
          <input className={inputCls} placeholder="Ad" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
          <select className={inputCls} value={w.kind} onChange={(e) => setW({ ...w, kind: e.target.value })}>
            <option value="discord">Discord</option><option value="telegram">Telegram</option><option value="generic">Özel panel</option>
          </select>
          <input className={inputCls} placeholder={w.kind === "telegram" ? "Bot token" : "Webhook adresi"} value={w.url} onChange={(e) => setW({ ...w, url: e.target.value })} />
          {w.kind === "telegram" && <input className={inputCls} placeholder="Sohbet ID" value={w.chatId} onChange={(e) => setW({ ...w, chatId: e.target.value })} />}
          <button className={btnCls} disabled={!w.name || !w.url || addHook.isPending} onClick={() =>{addHook.isPending && <Loader2 className="h-4 w-4 animate-spin" />} addHook.mutate()}>Ekle</button>
        </div>
        <div className="mt-5 space-y-1">
          {(data?.webhooks ?? []).map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
              <Radio className="h-4 w-4 text-secondary" />
              <span className="flex-1 truncate">{h.name} · {h.kind}</span>
              <span className="font-mono text-xs text-muted-foreground">{h.last_status ?? "-"}</span>
              <button className="text-destructive" onClick={() => delHook.mutate(h.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="EPG kaynakları">
        <div className="flex gap-2">
          <input className={inputCls} placeholder="https://… xmltv.xml" value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} />
          <button className={btnCls} disabled={!epgUrl || addEpg.isPending} onClick={() =>{addEpg.isPending && <Loader2 className="h-4 w-4 animate-spin" />} addEpg.mutate()}>Ekle</button>
        </div>
        <div className="mt-5 space-y-1">
          {(data?.epg ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
              <Rss className="h-4 w-4 text-secondary" />
              <span className="flex-1 truncate">{s.url}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.program_count}</span>
              <button className="text-destructive" onClick={() => delEpg.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {!data?.epg.length && <p className="text-sm text-muted-foreground">Kaynak yok. XMLTV adresi ekleyince program rehberi otomatik eşlenir.</p>}
        </div>
      </Card>
    </div>
  );
}
