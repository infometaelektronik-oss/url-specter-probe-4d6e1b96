import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UA_PRIMARY =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const UA_FALLBACK =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

function buildHeaders(targetUrl: string, ua: string): Record<string, string> {
  let origin = "";
  try {
    const u = new URL(targetUrl);
    origin = `${u.protocol}//${u.host}`;
  } catch {}
  return {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua":
      '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    ...(origin ? { Referer: origin + "/" } : {}),
  };
}

function looksBlocked(html: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const lower = html.slice(0, 4000).toLowerCase();
  return (
    lower.includes("cloudflare") &&
    (lower.includes("attention required") ||
      lower.includes("just a moment") ||
      lower.includes("checking your browser"))
  );
}

async function doFetch(url: string, ua: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(url, ua),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { status: res.status, html: text, finalUrl: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

export const crawlUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ url: z.string().url() }))
  .handler(async ({ data }) => {
    const log: string[] = [];
    log.push(`[CHROME] User-Agent kamuflajı aktif. Hedef: ${data.url}`);
    let attempt = await doFetch(data.url, UA_PRIMARY);
    if (looksBlocked(attempt.html, attempt.status)) {
      log.push(
        "[UYARI] - Site bot koruması tespit etti, alternatif tarayıcı kimliğiyle yeniden deneniyor...",
      );
      await new Promise((r) => setTimeout(r, 3000));
      attempt = await doFetch(data.url, UA_FALLBACK);
    }
    if (attempt.status >= 400) {
      log.push(`[HATA] HTTP ${attempt.status}`);
    } else {
      log.push(`[OK] ${attempt.html.length} bayt indirildi.`);
    }
    return {
      status: attempt.status,
      html: attempt.html,
      finalUrl: attempt.finalUrl,
      log,
    };
  });
