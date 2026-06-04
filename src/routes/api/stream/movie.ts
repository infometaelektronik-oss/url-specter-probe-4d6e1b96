import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/stream/movie")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        if (!url)
          return new Response(
            JSON.stringify({ error: "Film linki eksik." }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        try {
          const range = request.headers.get("range");
          const upstream = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "*/*",
              ...(range ? { Range: range } : {}),
            },
          });
          const headers: Record<string, string> = {
            ...CORS,
            "Content-Type":
              upstream.headers.get("content-type") || "video/mp4",
          };
          const cl = upstream.headers.get("content-length");
          const cr = upstream.headers.get("content-range");
          const ar = upstream.headers.get("accept-ranges");
          if (cl) headers["Content-Length"] = cl;
          if (cr) headers["Content-Range"] = cr;
          if (ar) headers["Accept-Ranges"] = ar;
          return new Response(upstream.body, {
            status: upstream.status,
            headers,
          });
        } catch {
          return new Response(
            JSON.stringify({
              error: "Film havuzu güvenlik duvarına takıldı, tünelleme başarısız.",
            }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
