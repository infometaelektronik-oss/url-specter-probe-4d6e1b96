// Stream health + quality/bitrate profiling + geo detection + required-header discovery.
import { smartFetch } from "./fetch.server";

export type Variant = { resolution: string; height: number; bandwidth: number; url: string | null };

export type ValidationResult = {
  ok: boolean;
  status: number;
  resolution: string;
  qualityTier: "FHD" | "HD" | "SD" | "AUDIO" | "unknown";
  bitrateKbps: number | null;
  variants: Variant[];
  isVideo: boolean;
  geoBlocked: boolean;
  geoCountry: string | null;
  responseMs: number;
  customHeaders: Record<string, string>;
};

function tierFor(h: number): ValidationResult["qualityTier"] {
  if (h >= 1080) return "FHD";
  if (h >= 576) return "HD";
  if (h > 0) return "SD";
  return "unknown";
}
function label(h: number) {
  if (h >= 2000) return "4K";
  if (h >= 1400) return "1440p";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 400) return "480p";
  return "SD";
}

const STREAM_INF = /#EXT-X-STREAM-INF:([^\n]*)\n([^\n#]+)/gi;

export function parseVariants(manifest: string, base: string): Variant[] {
  const out: Variant[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(STREAM_INF.source, "gi");
  while ((m = rx.exec(manifest))) {
    const attrs = m[1];
    const res = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bw = attrs.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
    const height = res ? parseInt(res[2], 10) : 0;
    let url: string | null = null;
    try {
      url = new URL(m[2].trim(), base).toString();
    } catch {
      /* ignore */
    }
    out.push({
      resolution: height ? label(height) : "auto",
      height,
      bandwidth: bw ? Math.round(parseInt(bw[1], 10) / 1000) : 0,
      url,
    });
  }
  return out.sort((a, b) => b.height - a.height);
}

export async function validateStream(url: string, referer?: string, country?: string): Promise<ValidationResult> {
  const r: ValidationResult = {
    ok: false, status: 0, resolution: "unknown", qualityTier: "unknown", bitrateKbps: null,
    variants: [], isVideo: false, geoBlocked: false, geoCountry: null, responseMs: 0, customHeaders: {},
  };

  let head = await smartFetch(url, { method: "HEAD", timeoutMs: 7000, referer, kind: "media", country, attempts: 2 });
  r.status = head.status;
  r.responseMs = head.ms;

  if ((head.status === 403 || head.status === 401) && !referer) {
    const origin = (() => { try { return new URL(url).origin + "/"; } catch { return undefined; } })();
    const retry = await smartFetch(url, { method: "HEAD", timeoutMs: 7000, referer: origin, kind: "media", country, attempts: 2 });
    if (retry.status >= 200 && retry.status < 400) {
      head = retry;
      r.status = retry.status;
      if (origin) r.customHeaders.Referer = origin;
    }
  }

  const geo = head.headers?.get("cf-ipcountry") || head.headers?.get("x-country") || null;
  if (geo) r.geoCountry = geo.toUpperCase();
  if (r.status === 451) r.geoBlocked = true;
  if (r.status < 200 || r.status >= 400) return r;

  if (/\.m3u8(\?|$)/i.test(url)) {
    const body = await smartFetch(url, { timeoutMs: 8000, referer: r.customHeaders.Referer ?? referer, kind: "media", country, attempts: 2 });
    if (body.text?.includes("#EXTM3U")) {
      r.isVideo = true;
      r.variants = parseVariants(body.text, url);
      if (r.variants.length) {
        const top = r.variants[0];
        r.resolution = top.resolution;
        r.bitrateKbps = top.bandwidth || null;
        r.qualityTier = tierFor(top.height);
      } else {
        r.resolution = "auto";
      }
      if (/country|region|geo-?block|not available in your/i.test(body.text)) r.geoBlocked = true;
    } else {
      return r;
    }
  } else if (/\.(mp4|ts|mkv|mpd)(\?|$)/i.test(url)) {
    r.isVideo = true;
    const ct = head.headers?.get("content-type") ?? "";
    if (ct && !/video|octet|mpegurl|dash|mp2t/i.test(ct)) r.isVideo = false;
  } else if (/\.mp3(\?|$)/i.test(url)) {
    r.isVideo = false;
    r.qualityTier = "AUDIO";
  }

  r.ok = r.status >= 200 && r.status < 400;
  return r;
}
