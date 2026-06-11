// Browser-safe HTML fetcher for crawl, with UA rotation + retry.

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

function headers(targetUrl: string, ua: string): Record<string, string> {
  let origin = "";
  try {
    const u = new URL(targetUrl);
    origin = `${u.protocol}//${u.host}`;
  } catch {
    /* noop */
  }
  return {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    ...(origin ? { Referer: origin + "/" } : {}),
  };
}

function blocked(html: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const head = html.slice(0, 4000).toLowerCase();
  return (
    head.includes("cloudflare") &&
    (head.includes("attention required") ||
      head.includes("just a moment") ||
      head.includes("checking your browser"))
  );
}

export async function fetchHtml(
  url: string,
  timeoutMs = 14000,
): Promise<{ html: string; finalUrl: string; status: number }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < UA_LIST.length; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: headers(url, UA_LIST[attempt]),
        redirect: "follow",
        signal: ctrl.signal,
      });
      const html = await res.text();
      clearTimeout(t);
      if (!blocked(html, res.status) || attempt === UA_LIST.length - 1) {
        return { html, finalUrl: res.url || url, status: res.status };
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      lastErr = e;
      clearTimeout(t);
    }
  }
  if (lastErr) throw lastErr;
  return { html: "", finalUrl: url, status: 0 };
}
