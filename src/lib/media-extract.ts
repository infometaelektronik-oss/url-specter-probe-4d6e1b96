// Server-safe HTML extraction utilities (no DOMParser dependency).

const STREAM_RE =
  /https?:\/\/[^\s'"<>()\\]+?\.(?:m3u8|mp4|mpd|ts)(?:\?[^\s'"<>()\\]*)?/gi;
const IFRAME_SRC_RE = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
const ANCHOR_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const IMG_IN_ANCHOR_RE = /<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i;
const IMG_ALT_RE = /<img[^>]*alt=["']([^"']+)["'][^>]*>/i;
const OG_IMAGE_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
const OG_TITLE_RE = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

const TRAILER_RE =
  /(fragman|teaser|tan[ıi]t[ıi]m|shorts?|preview|kisa[\s-]?bolum|behind|making[\s-]?of|jenerik)/i;
const MEDIA_HINT_RE =
  /(dizi|canli|canl[ıi]|yayin|yay[ıi]n|film|izle|bolum|b[öo]l[üu]m|episode|player|watch|series|show|tv|canlitv)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function absUrl(base: string, value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(javascript:|mailto:|tel:|data:)/i.test(trimmed))
    return "";
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return "";
  }
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

export function extractStreams(html: string, baseUrl: string): string[] {
  const direct = Array.from(html.matchAll(STREAM_RE), (m) => absUrl(baseUrl, m[0]));
  const iframes = Array.from(html.matchAll(IFRAME_SRC_RE), (m) => absUrl(baseUrl, m[1]));
  return unique([...direct, ...iframes]);
}

export type RawItem = {
  url: string;
  title: string;
  thumbnail: string;
};

export function extractCandidates(html: string, baseUrl: string, limit = 60): RawItem[] {
  const ogImg = absUrl(baseUrl, html.match(OG_IMAGE_RE)?.[1]);
  const seen = new Set<string>();
  const out: RawItem[] = [];

  for (const match of html.matchAll(ANCHOR_RE)) {
    const href = absUrl(baseUrl, match[1]);
    if (!href || seen.has(href)) continue;
    const inner = match[2] || "";
    const text = stripTags(inner);
    const imgMatch = inner.match(IMG_IN_ANCHOR_RE);
    const altMatch = inner.match(IMG_ALT_RE);
    const thumb = absUrl(baseUrl, imgMatch?.[1]) || ogImg;
    const alt = altMatch?.[1] || "";
    const blob = `${href} ${text} ${alt}`;

    if (TRAILER_RE.test(blob)) continue;
    if (!MEDIA_HINT_RE.test(blob) && !thumb) continue;

    seen.add(href);
    out.push({
      url: href,
      title: text || alt || fallbackName(href),
      thumbnail: thumb,
    });
    if (out.length >= limit) break;
  }

  return out;
}

export function extractRootMeta(html: string): { title: string; ogImage: string } {
  return {
    title: stripTags(html.match(OG_TITLE_RE)?.[1] || html.match(TITLE_RE)?.[1] || ""),
    ogImage: html.match(OG_IMAGE_RE)?.[1] || "",
  };
}

export function fallbackName(link: string): string {
  try {
    const last = new URL(link).pathname.split("/").filter(Boolean).pop() || link;
    return decodeURIComponent(last).replace(/[-_]/g, " ").trim();
  } catch {
    return link;
  }
}

export function isTrailerish(title: string, url: string): boolean {
  return TRAILER_RE.test(`${title} ${url}`);
}
