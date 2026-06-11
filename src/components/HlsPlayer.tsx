import { useEffect, useRef } from "react";
import HLS from "hls.js";

interface HlsPlayerProps {
  src: string;
}

export function HlsPlayer({ src }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Handle HLS streams
    if (src.includes(".m3u8")) {
      if (HLS.isSupported()) {
        const hls = new HLS();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HLS.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            // Autoplay prevented
          });
        });

        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari
        video.src = src;
      }
    } else {
      // Regular video file
      video.src = src;
    }

    return () => {
      video.src = "";
    };
  }, [src]);

  return (
    <div className="w-full bg-black">
      <video
        ref={videoRef}
        controls
        className="aspect-video w-full"
        controlsList="nodownload"
      />
    </div>
  );
}