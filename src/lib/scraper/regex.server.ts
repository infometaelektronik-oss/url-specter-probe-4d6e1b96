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
