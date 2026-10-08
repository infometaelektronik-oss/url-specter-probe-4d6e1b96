// Akıllı URL ayıklayıcı (Madde 5) + isim temizleme (Madde 7) + kategori (Madde 13)
export const STREAM_RE =
  /https?:\/\/[^\s'"<>()\\]+?\.(?:m3u8|mp4|ts|mkv|mp3|mpd)(?:\?[^\s'"<>()\\]*)?/gi;
export const IFRAME_SRC_RE = /<iframe[^>]+src=["']([^"']+)["']/gi;
export const OG_IMAGE_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
export const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
export const META_DESC_RE = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i;

export function extractStreamUrls(text: string): string[] {
  const raw = text.match(STREAM_RE) ?? [];
  return Array.from(new Set(raw.map((u) => u.replace(/[.,;)\]}]+$/, ""))));
}

export function extractIframes(html: string, base: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(IFRAME_SRC_RE.source, "gi");
  while ((m = rx.exec(html))) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      /* ignore */
    }
  }
  return Array.from(new Set(out));
}

const NOISE_RE =
  /(donmadan|kesintisiz|hd|full ?hd|4k|canli|canlı|izle|watch|live|stream|online|bedava|free|\|+|—|-{2,}|\d{1,2}[./]\d{1,2}[./]\d{2,4}|\[.*?\]|\(.*?\)|\bepisode\b|\bbolum\b|\bbölüm\b)/gi;

export function cleanTitle(raw: string): string {
  return (
    raw
      .replace(/&[a-z]+;/gi, " ")
      .replace(NOISE_RE, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140) || "Bilinmeyen"
  );
}

// Keyword fallback kategorizasyon (AI'ya gitmeden önce hızlı guess)
export function guessCategory(hay: string): string {
  const s = hay.toLowerCase();
  if (/(spor|sport|bein|match|maç|fenerbah|galata|beşikta|trabzon|futbol|basket|nba)/.test(s))
    return "Spor";
  if (/(belge|documentary|nat ?geo|discovery|history|animal)/.test(s)) return "Belgesel";
  if (/(haber|news|cnn|ntv|bloom|habertürk|habertürk)/.test(s)) return "Haber";
  if (/(çocuk|cocuk|kids|cartoon|disney|nickel)/.test(s)) return "Çocuk";
  if (/(müzik|muzik|music|kral|number ?one|mtv)/.test(s)) return "Müzik";
  if (/(sinema|movie|film|cinema)/.test(s)) return "Sinema";
  if (/(dizi|series|episode|bölüm|bolum|season|sezon)/.test(s)) return "Dizi";
  if (/(kanal ?d|star|show|atv|tv8|trt|now|fox)/.test(s)) return "Ulusal";
  if (/(radio|radyo|fm)/.test(s)) return "Radyo";
  return "Diğer";
}

export function guessType(hay: string): "live_tv" | "movie" | "series" | "radio" {
  const s = hay.toLowerCase();
  if (/radio|radyo|\.mp3\b/.test(s)) return "radio";
  if (/dizi|series|episode|bölüm|bolum|season|sezon/.test(s)) return "series";
  if (/film|movie|sinema/.test(s)) return "movie";
  return "live_tv";
}

// --- Heuristic deep extraction -------------------------------------------------
export const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+)["']/gi;
// player config keys: file:"...", source:'...', "src":"...", hls:"..."
export const CONFIG_URL_RE =
  /["'](?:file|source|src|hls|url|stream|playlist|manifest)["']\s*:\s*["']([^"']{8,})["']/gi;
export const B64_RE = /["']([A-Za-z0-9+/]{40,}={0,2})["']/g;

export function extractScripts(html: string, base: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(SCRIPT_SRC_RE.source, "gi");
  while ((m = rx.exec(html))) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      /* ignore */
    }
  }
  return Array.from(new Set(out));
}

function unescapeUrls(text: string) {
  return text.replace(/\\\//g, "/").replace(/\\u002[fF]/g, "/").replace(/&amp;/g, "&");
}

/** Deep scan: raw regex + unescaped text + player config keys + base64 payloads. */
export function deepExtract(text: string, base?: string): string[] {
  const found = new Set<string>();
  const add = (u: string) => {
    const clean = u.replace(/[.,;)\]}'"]+$/, "");
    if (/^https?:\/\//i.test(clean)) found.add(clean);
    else if (base && clean.startsWith("/")) {
      try {
        found.add(new URL(clean, base).toString());
      } catch {
        /* ignore */
      }
    }
  };

  const un = unescapeUrls(text);
  for (const t of [text, un]) extractStreamUrls(t).forEach(add);

  let m: RegExpExecArray | null;
  const cfg = new RegExp(CONFIG_URL_RE.source, "gi");
  while ((m = cfg.exec(un))) {
    const v = m[1];
    if (/\.(m3u8|mp4|ts|mpd|mkv|mp3)(\?|$)/i.test(v)) add(v);
  }

  const b64 = new RegExp(B64_RE.source, "g");
  let b: RegExpExecArray | null;
  let decodes = 0;
  while ((b = b64.exec(text)) && decodes < 40) {
    decodes++;
    try {
      const dec = atob(b[1]);
      if (/\.(m3u8|mp4|mpd)/i.test(dec)) extractStreamUrls(unescapeUrls(dec)).forEach(add);
    } catch {
      /* not base64 */
    }
  }

  return Array.from(found);
}
