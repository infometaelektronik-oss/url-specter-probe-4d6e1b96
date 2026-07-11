// Madde 8: HTTP ping. Madde 9: m3u8 manifest parse (FFmpeg yerine). Madde 10: geoblock heuristic.
import { safeFetch } from "./user-agents";

export type ValidationResult = {
  ok: boolean;
  status: number;
  resolution: string;
  isVideo: boolean;
  geoBlocked: boolean;
  customHeaders: Record<string, string>;
};

const RESOLUTION_RE = /RESOLUTION=(\d+)x(\d+)/g;

function labelForHeight(h: number): string {
  if (h >= 2000) return "4K";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 400) return "480p";
  return "SD";
}

export async function validateStream(
  url: string,
  referer?: string,
): Promise<ValidationResult> {
  const result: ValidationResult = {
    ok: false,
    status: 0,
    resolution: "unknown",
    isVideo: false,
    geoBlocked: false,
    customHeaders: {},
  };

  // 1) HTTP HEAD
  const head = await safeFetch(url, { method: "HEAD", timeoutMs: 6000, referer });
  result.status = head.status;
  if (head.status === 403 && !referer) {
    // 403 → referer kontrolü olabilir. Kaynak sayfa referer ile tekrar dene.
    const retry = await safeFetch(url, { method: "HEAD", timeoutMs: 6000, referer: url });
    if (retry.status >= 200 && retry.status < 400) {
      result.status = retry.status;
      result.customHeaders.Referer = url;
    }
  }
  if (result.status < 200 || result.status >= 400) return result;

  // Geoblock heuristic
  const geoHint = head.headers?.get("cf-ipcountry") || head.headers?.get("x-country") || "";
  const forbidText = (head.headers?.get("x-error") || "").toLowerCase();
  if (/geo|region|country/.test(forbidText)) result.geoBlocked = true;

  // 2) m3u8 → manifest indirip resolution parse et
  if (/\.m3u8(\?|$)/i.test(url)) {
    const body = await safeFetch(url, {
      timeoutMs: 6000,
      referer: result.customHeaders.Referer,
    });
    if (body.text) {
      const heights: number[] = [];
      let m: RegExpExecArray | null;
      const rx = new RegExp(RESOLUTION_RE.source, "g");
      while ((m = rx.exec(body.text))) heights.push(parseInt(m[2], 10));
      if (heights.length) {
        result.resolution = labelForHeight(Math.max(...heights));
        result.isVideo = true;
      } else if (body.text.includes("#EXTM3U")) {
        result.isVideo = true; // canlı manifest, resolution belirtilmemiş
        result.resolution = "auto";
      }
      if (/country|region|geo|forbidden/i.test(body.text)) result.geoBlocked = true;
    }
  } else if (/\.(mp4|ts|mkv|mpd)(\?|$)/i.test(url)) {
    // Video/segment dosyası — HEAD 200 verdi, kabul
    result.isVideo = true;
    const ct = head.headers?.get("content-type") || "";
    if (/video|octet/.test(ct)) result.isVideo = true;
  } else if (/\.mp3(\?|$)/i.test(url)) {
    result.isVideo = false; // radyo, ses akışı
  }

  result.ok = result.status >= 200 && result.status < 400;
  if (geoHint && geoHint.toUpperCase() !== "TR") result.geoBlocked = true;
  return result;
}
