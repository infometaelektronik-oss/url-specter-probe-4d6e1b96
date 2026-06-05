import { createFileRoute } from "@tanstack/react-router";

const M3U8_RE =
  /(https?:\/\/[\w\d.\-:/_?=&;#%]+?\.m3u8(?:\?[\w\d.\-:/_?=&;#%]*)?)/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/stream/live")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        if (!url)
          return new Response(
            JSON.stringify({ error: "Kanal linki eksik." }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const page = await fetch(url, {
            headers: {
              "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
              Referer: "https://www.kanald.com.tr/",
            },
            signal: ctrl.signal,
          });
          const html = await page.text();
          clearTimeout(t);
          const m = html.match(M3U8_RE);
          if (!m)
            return new Response(
              JSON.stringify({ error: "Canlı yayın akışı bulunamadı." }),
              { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
            );
          const upstream = await fetch(m[0], {
            headers: { "User-Agent": "VLC/3.0.18" },
          });
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              ...CORS,
              "Content-Type":
                upstream.headers.get("content-type") || "application/x-mpegURL",
            },
          });
        } catch {
          return new Response(
            JSON.stringify({ error: "Canlı yayın sunucu engeli aşılamadı." }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
