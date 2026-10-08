// Smart fetch: identity rotation + proxy rotation + block detection + captcha escalation + telemetry.
import { rawFetch, randomProfile, type FetchResult } from "./user-agents";
import { applyProxy, loadProxies, pickProxy, reportProxy } from "./proxy.server";
import { captchaConfigured, detectChallenge, solveChallenge } from "./captcha.server";

export type SmartOptions = {
  timeoutMs?: number;
  referer?: string;
  method?: "GET" | "HEAD";
  kind?: "document" | "media" | "api";
  country?: string | null;
  extraHeaders?: Record<string, string>;
  attempts?: number;
  useProxy?: boolean;
};

export const telemetry = {
  requests: 0,
  success: 0,
  failed: 0,
  banned: 0,
  totalMs: 0,
  reset() {
    this.requests = 0;
    this.success = 0;
    this.failed = 0;
    this.banned = 0;
    this.totalMs = 0;
  },
  snapshot() {
    return {
      requests: this.requests,
      success: this.success,
      failed: this.failed,
      banned: this.banned,
      avg_ms: this.requests ? Math.round(this.totalMs / this.requests) : 0,
    };
  },
};

export async function smartFetch(url: string, opts: SmartOptions = {}): Promise<FetchResult> {
  const attempts = opts.attempts ?? 3;
  const proxies = opts.useProxy === false ? [] : await loadProxies().catch(() => []);
  const usedProxies: string[] = [];
  let last: FetchResult | null = null;

  for (let i = 0; i < attempts; i++) {
    const proxy = proxies.length ? pickProxy(proxies, opts.country, usedProxies) : null;
    if (proxy) usedProxies.push(proxy.id);
    const profile = randomProfile(i === attempts - 1 ? "player" : undefined);
    const res = await rawFetch(url, {
      ...opts,
      profile,
      fetchUrl: proxy ? applyProxy(proxy, url, opts.country) : undefined,
      viaProxy: proxy?.label ?? null,
    });
    telemetry.requests += 1;
    telemetry.totalMs += res.ms;
    last = res;

    if (res.status >= 200 && res.status < 400 && !res.blocked) {
      telemetry.success += 1;
      if (proxy) void reportProxy(proxy.id, "success");
      return res;
    }

    if (res.blocked) {
      telemetry.banned += 1;
      if (proxy) void reportProxy(proxy.id, "ban");
      // Challenge escalation
      if (res.text && captchaConfigured()) {
        const ch = detectChallenge(res.text);
        if (ch) {
          const token = await solveChallenge("2captcha", ch.kind, ch.sitekey, url);
          if (token) {
            const solved = await rawFetch(url, {
              ...opts,
              profile,
              extraHeaders: {
                ...(opts.extraHeaders ?? {}),
                "cf-turnstile-response": token,
                "g-recaptcha-response": token,
              },
              fetchUrl: proxy ? applyProxy(proxy, url, opts.country) : undefined,
              viaProxy: proxy?.label ?? null,
            });
            telemetry.requests += 1;
            telemetry.totalMs += solved.ms;
            if (solved.status >= 200 && solved.status < 400 && !solved.blocked) {
              telemetry.success += 1;
              return solved;
            }
          }
        }
      }
    } else if (proxy) {
      void reportProxy(proxy.id, "fail");
    }

    // small jittered backoff, mimicking human pacing
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 900));
  }

  telemetry.failed += 1;
  return (
    last ?? { status: 0, text: null, headers: null, ms: 0, profile: "none", viaProxy: null, blocked: false }
  );
}

/** Run tasks with a hard concurrency cap (worker runtime allows 6 in-flight connections). */
export async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
