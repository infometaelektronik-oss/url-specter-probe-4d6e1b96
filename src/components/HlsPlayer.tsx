import { useEffect, useRef } from "react";
import Hls from "hls.js";

export function HlsPlayer({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    // Route m3u8 / mp4 through our backend tunnels so CORS & referer pass
    const proxied = /\.m3u8(\?|$)/i.test(src)
      ? `/api/stream/live?url=${encodeURIComponent(src)}`
      : /\.mp4(\?|$)/i.test(src)
        ? `/api/stream/movie?url=${encodeURIComponent(src)}`
        : src;

    let hls: Hls | null = null;
    if (/\.m3u8(\?|$)/i.test(src) && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(proxied);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) console.warn("HLS fatal:", data.type, data.details);
      });
    } else {
      video.src = proxied;
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      controls
      autoPlay
      poster={poster}
      className="w-full aspect-video bg-black rounded-lg border border-border"
    />
  );
}
