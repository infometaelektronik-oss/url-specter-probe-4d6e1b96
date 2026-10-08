import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Cpu, Radio, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Core Stream Engine — Otonom Akış Motoru" },
      { name: "description", content: "Arka planda çalışan otonom akış kazıma, doğrulama ve IPTV besleme motoru." },
      { property: "og:title", content: "Core Stream Engine — Otonom Akış Motoru" },
      { property: "og:description", content: "Arka planda çalışan otonom akış kazıma, doğrulama ve IPTV besleme motoru." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const items = [
    { icon: Cpu, t: "Dağıtık işçiler", d: "Kuyruk tabanlı paralel tarama" },
    { icon: Activity, t: "Sağlık & kalite", d: "FHD / HD / SD profilleme" },
    { icon: ShieldCheck, t: "Güvenli API", d: "Anahtar, IP listesi, limit" },
    { icon: Radio, t: "M3U + EPG", d: "IPTV'ne doğrudan besleme" },
  ];
  return (
    <main className="dot-grid min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> engine online
        </div>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          Core Stream <span className="text-gradient">Engine</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          İnsan müdahalesi olmadan akış bulan, doğrulayan, sınıflandıran ve kendi IPTV sistemine API ile sunan arka plan motoru.
        </p>
        <div className="mt-8">
          <Link to="/console" className="inline-flex items-center rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-neon)] transition hover:opacity-90">
            Konsola gir
          </Link>
        </div>
        <div className="mt-16 grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map(({ icon: I, t, d }) => (
            <div key={t} className="surface rounded-xl p-4">
              <I className="mb-3 h-5 w-5 text-secondary" />
              <div className="font-semibold">{t}</div>
              <div className="text-sm text-muted-foreground">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
