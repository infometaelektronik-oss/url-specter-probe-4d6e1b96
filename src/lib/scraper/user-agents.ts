// Dynamic device fingerprint pool. Every request gets a coherent identity:
// UA + client hints + platform + viewport + language + referer.
export type DeviceProfile = {
  id: string;
  family: "desktop" | "mobile" | "tablet" | "smart_tv" | "android_tv" | "player";
  ua: string;
  platform: string;
  mobile: boolean;
  brands?: string;
  viewport: string;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generated per call so the version space is effectively unbounded.
function chromeBrands(major: number, edge = false) {
  const nb = pick(['"Not(A:Brand";v="99"', '"Not A(Brand";v="8"', '"Not/A)Brand";v="24"']);
  return edge
    ? `"Chromium";v="${major}", "Microsoft Edge";v="${major}", ${nb}`
    : `"Chromium";v="${major}", "Google Chrome";v="${major}", ${nb}`;
}

const GENERATORS: Array<() => DeviceProfile> = [
  () => {
    const v = rnd(124, 134);
    return {
      id: `win-chrome-${v}`, family: "desktop", mobile: false, platform: '"Windows"',
      ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.${rnd(6000, 6900)}.${rnd(50, 200)} Safari/537.36`,
      brands: chromeBrands(v), viewport: pick(["1920x1080", "2560x1440", "1366x768", "1536x864"]),
    };
  },
  () => {
    const v = rnd(124, 134);
    return {
      id: `win-edge-${v}`, family: "desktop", mobile: false, platform: '"Windows"',
      ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.${rnd(2000, 2900)}.${rnd(40, 99)}`,
      brands: chromeBrands(v, true), viewport: pick(["1920x1080", "1600x900"]),
    };
  },
  () => {
    const v = rnd(125, 133);
    return {
      id: `win-firefox-${v}`, family: "desktop", mobile: false, platform: '"Windows"',
      ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
      viewport: "1920x1080",
    };
  },
  () => {
    const v = rnd(124, 134);
    return {
      id: `mac-chrome-${v}`, family: "desktop", mobile: false, platform: '"macOS"',
      ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
      brands: chromeBrands(v), viewport: pick(["1440x900", "1728x1117", "2560x1600"]),
    };
  },
  () => {
    const s = pick(["17.4", "17.5", "17.6", "18.0", "18.1", "18.2"]);
    return {
      id: `mac-safari-${s}`, family: "desktop", mobile: false, platform: '"macOS"',
      ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${s} Safari/605.1.15`,
      viewport: "1440x900",
    };
  },
  () => {
    const v = rnd(124, 134);
    return {
      id: `linux-chrome-${v}`, family: "desktop", mobile: false, platform: '"Linux"',
      ua: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
      brands: chromeBrands(v), viewport: "1920x1080",
    };
  },
  () => {
    const v = rnd(124, 134);
    const model = pick(["SM-S918B", "SM-A546B", "Pixel 8", "Pixel 7a", "M2101K6G", "CPH2451", "RMX3700"]);
    return {
      id: `android-chrome-${v}`, family: "mobile", mobile: true, platform: '"Android"',
      ua: `Mozilla/5.0 (Linux; Android ${rnd(12, 15)}; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`,
      brands: chromeBrands(v), viewport: pick(["412x915", "393x873", "360x800"]),
    };
  },
  () => {
    const ios = pick(["17_4", "17_5", "17_6", "18_0", "18_1", "18_2"]);
    return {
      id: `iphone-${ios}`, family: "mobile", mobile: true, platform: '"iOS"',
      ua: `Mozilla/5.0 (iPhone; CPU iPhone OS ${ios} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ios.replace("_", ".")} Mobile/15E148 Safari/604.1`,
      viewport: pick(["390x844", "430x932", "393x852"]),
    };
  },
  () => {
    const ios = pick(["17_5", "18_0", "18_1"]);
    return {
      id: `ipad-${ios}`, family: "tablet", mobile: false, platform: '"iOS"',
      ua: `Mozilla/5.0 (iPad; CPU OS ${ios} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ios.replace("_", ".")} Mobile/15E148 Safari/604.1`,
      viewport: "820x1180",
    };
  },
  () => ({
    id: "tizen-tv", family: "smart_tv", mobile: false, platform: '"Tizen"',
    ua: `Mozilla/5.0 (SMART-TV; LINUX; Tizen ${pick(["6.0", "6.5", "7.0"])}) AppleWebKit/537.36 (KHTML, like Gecko) ${rnd(76, 94)}.0.0.0/${pick(["6.0", "6.5", "7.0"])} TV Safari/537.36`,
    viewport: "1920x1080",
  }),
  () => ({
    id: "webos-tv", family: "smart_tv", mobile: false, platform: '"webOS"',
    ua: `Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${rnd(79, 108)}.0.0.0 Safari/537.36 WebAppManager`,
    viewport: "1920x1080",
  }),
  () => ({
    id: "android-tv", family: "android_tv", mobile: false, platform: '"Android"',
    ua: `Mozilla/5.0 (Linux; Android ${rnd(9, 12)}; ${pick(["SHIELD Android TV", "AFTMM", "MiTV-AXSO0", "BRAVIA 4K VH2"])}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${rnd(100, 126)}.0.0.0 Safari/537.36`,
    viewport: "1920x1080",
  }),
  () => ({
    id: "exoplayer", family: "player", mobile: false, platform: '"Android"',
    ua: `ExoPlayerLib/${pick(["2.18.7", "2.19.1", "1.3.1"])} (Linux; Android ${rnd(10, 14)})`,
    viewport: "1920x1080",
  }),
  () => ({
    id: "vlc", family: "player", mobile: false, platform: '"Windows"',
    ua: `VLC/${pick(["3.0.18", "3.0.20", "3.0.21"])} LibVLC/${pick(["3.0.18", "3.0.20", "3.0.21"])}`,
    viewport: "1920x1080",
  }),
];

const LANGS = [
  "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  "tr,en;q=0.9",
  "en-US,en;q=0.9,tr;q=0.6",
  "de-DE,de;q=0.9,tr;q=0.7,en;q=0.6",
];

export function randomProfile(family?: DeviceProfile["family"]): DeviceProfile {
  for (let i = 0; i < 20; i++) {
    const p = pick(GENERATORS)();
    if (!family || p.family === family) return p;
  }
  return GENERATORS[0]();
}

export function profileHeaders(
  p: DeviceProfile,
  opts: { referer?: string; kind?: "document" | "media" | "api" } = {},
): Record<string, string> {
  const kind = opts.kind ?? "document";
  const h: Record<string, string> = {
    "User-Agent": p.ua,
    "Accept-Language": pick(LANGS),
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  };
  if (kind === "document") {
    h.Accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
    h["Upgrade-Insecure-Requests"] = "1";
    h["Sec-Fetch-Dest"] = "document";
    h["Sec-Fetch-Mode"] = "navigate";
    h["Sec-Fetch-Site"] = opts.referer ? "same-origin" : "none";
    h["Sec-Fetch-User"] = "?1";
  } else if (kind === "media") {
    h.Accept = "*/*";
    h["Sec-Fetch-Dest"] = "empty";
    h["Sec-Fetch-Mode"] = "cors";
    h["Sec-Fetch-Site"] = "cross-site";
  } else {
    h.Accept = "application/json, text/plain, */*";
  }
  if (p.brands) {
    h["Sec-Ch-Ua"] = p.brands;
    h["Sec-Ch-Ua-Mobile"] = p.mobile ? "?1" : "?0";
    h["Sec-Ch-Ua-Platform"] = p.platform;
  }
  if (opts.referer) {
    try {
      h.Referer = opts.referer;
      h.Origin = new URL(opts.referer).origin;
    } catch {
      /* ignore */
    }
  }
  return h;
}

// Back-compat helper
export function rotateHeaders(referer?: string): Record<string, string> {
  return profileHeaders(randomProfile(), { referer });
}

export type FetchResult = {
  status: number;
  text: string | null;
  headers: Headers | null;
  ms: number;
  profile: string;
  viaProxy: string | null;
  blocked: boolean;
};

const BLOCK_RE = /(cf-chl|challenge-platform|just a moment|attention required|captcha|access denied|ddos-guard)/i;

/**
 * Low-level fetch with identity rotation. The proxy layer (proxy.server.ts) wraps this.
 */
export async function rawFetch(
  url: string,
  opts: {
    timeoutMs?: number;
    referer?: string;
    method?: "GET" | "HEAD";
    kind?: "document" | "media" | "api";
    extraHeaders?: Record<string, string>;
    profile?: DeviceProfile;
    fetchUrl?: string; // when routed through a proxy gateway
    viaProxy?: string | null;
  } = {},
): Promise<FetchResult> {
  const profile = opts.profile ?? randomProfile();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  const started = Date.now();
  try {
    const r = await fetch(opts.fetchUrl ?? url, {
      method: opts.method ?? "GET",
      headers: { ...profileHeaders(profile, { referer: opts.referer, kind: opts.kind }), ...(opts.extraHeaders ?? {}) },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = opts.method === "HEAD" ? null : await r.text().catch(() => null);
    const blocked =
      r.status === 403 || r.status === 429 || r.status === 503
        ? true
        : !!text && text.length < 30000 && BLOCK_RE.test(text.slice(0, 5000));
    return { status: r.status, text, headers: r.headers, ms: Date.now() - started, profile: profile.id, viaProxy: opts.viaProxy ?? null, blocked };
  } catch {
    return { status: 0, text: null, headers: null, ms: Date.now() - started, profile: profile.id, viaProxy: opts.viaProxy ?? null, blocked: false };
  } finally {
    clearTimeout(t);
  }
}

/** Direct fetch (no proxy). Kept for modules that must not use the proxy layer. */
export async function safeFetch(
  url: string,
  opts: { timeoutMs?: number; referer?: string; method?: "GET" | "HEAD" } = {},
) {
  return rawFetch(url, opts);
}
