// Liveness probe: HEAD, fall back to Range GET. Treats 2xx/206 as alive.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0";

export async function probeUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    }).catch(() => null);

    if (!res || res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": UA, Range: "bytes=0-1024", Accept: "*/*" },
        signal: ctrl.signal,
        redirect: "follow",
      }).catch(() => null);
    }
    if (!res) return false;
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function probeMany(urls: string[], concurrency = 6): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      if (!u) break;
      result.set(u, await probeUrl(u));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return result;
}
