// Proxy rotation / IP masking layer.
// The worker runtime cannot open raw HTTP(S) proxy sockets, so proxies are URL-rewriting
// gateways: a template containing {url} (encoded) or {rawUrl}, and optionally {country}.
//   https://gw.provider.com/v1?token=XYZ&country={country}&url={url}
// Rotation is weighted by success rate; banned proxies are deprioritised automatically.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ProxyRow = {
  id: string;
  label: string;
  template: string;
  country: string | null;
  success_count: number;
  fail_count: number;
  ban_count: number;
};

let cache: { rows: ProxyRow[]; at: number } | null = null;

export async function loadProxies(): Promise<ProxyRow[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const { data } = await supabaseAdmin
    .from("proxies")
    .select("id,label,template,country,success_count,fail_count,ban_count")
    .eq("active", true);
  cache = { rows: data ?? [], at: Date.now() };
  return cache.rows;
}

function score(p: ProxyRow) {
  const total = p.success_count + p.fail_count + p.ban_count;
  if (total < 5) return 1;
  return Math.max(0.05, (p.success_count - p.ban_count) / total);
}

/** Weighted pick, optionally constrained to a country (geo-targeted routing). */
export function pickProxy(rows: ProxyRow[], country?: string | null, exclude: string[] = []): ProxyRow | null {
  let pool = rows.filter((p) => !exclude.includes(p.id));
  if (country) {
    const geo = pool.filter((p) => p.country?.toUpperCase() === country.toUpperCase());
    pool = geo.length ? geo : pool.filter((p) => !p.country);
  }
  if (!pool.length) return null;
  const w = pool.map(score);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function applyProxy(p: ProxyRow, url: string, country?: string | null): string {
  return p.template
    .replace("{url}", encodeURIComponent(url))
    .replace("{rawUrl}", url)
    .replace("{country}", (country ?? p.country ?? "").toLowerCase());
}

export async function reportProxy(id: string, outcome: "success" | "fail" | "ban") {
  await supabaseAdmin.rpc("proxy_stat", { _id: id, _outcome: outcome });
}
