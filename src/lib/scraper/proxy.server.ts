// Proxy rotation / IP masking layer.
// The worker runtime cannot open raw HTTP(S) proxy sockets, so proxies are modelled as
// URL-rewriting gateways: a template string containing {url} (and optionally {country}).
//   https://gw.provider.com/v1?token=XYZ&country={country}&url={url}
// Rotation is weighted by recent success rate; banned proxies cool down automatically.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProxyRow = {
  id: string;
  label: string;
  template: string;
  country: string | null;
  kind: string;
  active: boolean;
  success_count: number;
  fail_count: number;
  ban_count: number;
};

let cache: { rows: ProxyRow[]; at: number } | null = null;
const TTL = 60_000;

type Db = SupabaseClient<never, never, never>;

export async function loadProxies(db: { from: (t: string) => never }): Promise<ProxyRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const client = db as unknown as Db;
  const { data } = await (client.from("proxies") as unknown as {
    select: (s: string) => { eq: (a: string, b: boolean) => Promise<{ data: ProxyRow[] | null }> };
  })
    .select("id,label,template,country,kind,active,success_count,fail_count,ban_count")
    .eq("active", true);
  cache = { rows: (data as ProxyRow[] | null) ?? [], at: Date.now() };
  return cache.rows;
}

export function invalidateProxyCache() {
  cache = null;
}

function score(p: ProxyRow) {
  const total = p.success_count + p.fail_count + p.ban_count;
  if (total < 5) return 1; // give new proxies a chance
  return Math.max(0.05, p.success_count / total - p.ban_count / (total * 2));
}

/** Weighted pick, optionally constrained to a country (geo-targeted routing). */
export function pickProxy(rows: ProxyRow[], country?: string | null): ProxyRow | null {
  const pool = country ? rows.filter((p) => !p.country || p.country.toUpperCase() === country.toUpperCase()) : rows;
  if (!pool.length) return null;
  const weights = pool.map(score);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function applyProxy(proxy: ProxyRow, url: string, country?: string | null): string {
  return proxy.template
    .replace("{url}", encodeURIComponent(url))
    .replace("{rawUrl}", url)
    .replace("{country}", (country ?? proxy.country ?? "").toLowerCase());
}

export async function reportProxy(
  db: { rpc?: unknown; from: (t: string) => never },
  id: string,
  outcome: "success" | "fail" | "ban",
) {
  const client = db as unknown as Db;
  const field = outcome === "success" ? "success_count" : outcome === "fail" ? "fail_count" : "ban_count";
  await (client.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<unknown>)("increment_proxy_stat", {
    _id: id,
    _field: field,
  }).catch(() => undefined);
}
