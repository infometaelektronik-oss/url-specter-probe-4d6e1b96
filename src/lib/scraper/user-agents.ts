// UA + header rotasyonu (Madde 21 & 22)
const AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
];
const ACCEPTS = [
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "text/html,application/xhtml+xml,image/webp,*/*;q=0.8",
];
const LANGS = ["tr-TR,tr;q=0.9,en;q=0.7", "en-US,en;q=0.9,tr;q=0.6"];

export function rotateHeaders(referer?: string): Record<string, string> {
  const ua = AGENTS[Math.floor(Math.random() * AGENTS.length)];
  return {
    "User-Agent": ua,
    Accept: ACCEPTS[Math.floor(Math.random() * ACCEPTS.length)],
    "Accept-Language": LANGS[Math.floor(Math.random() * LANGS.length)],
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
  };
}

export async function safeFetch(
  url: string,
  opts: { timeoutMs?: number; referer?: string; method?: "GET" | "HEAD" } = {},
): Promise<{ status: number; text: string | null; headers: Headers | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  try {
    const r = await fetch(url, {
      method: opts.method ?? "GET",
      headers: rotateHeaders(opts.referer),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = opts.method === "HEAD" ? null : await r.text().catch(() => null);
    return { status: r.status, text, headers: r.headers };
  } catch {
    return { status: 0, text: null, headers: null };
  } finally {
    clearTimeout(t);
  }
}
