import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/playlist.m3u")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { CORS } = await import("@/lib/api/auth.server");
        return new Response(null, { status: 204, headers: CORS });
      },
      GET: async ({ request }) => {
        const { authenticateRequest, errorResponse, cached, CORS } = await import("@/lib/api/auth.server");
        const auth = await authenticateRequest(request);
        if (!auth.ok) return errorResponse(auth);

        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "live_tv";
        const quality = url.searchParams.get("quality");
        // proxied=1 → links point back at this engine so headers/tokens are injected per request
        const proxied = url.searchParams.get("proxied") === "1";
        const apiKey = request.headers.get("x-api-key") ?? url.searchParams.get("key") ?? "";

        const { body, contentType } = await cached(`m3u:${type}:${quality ?? ""}:${proxied}`, 60, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { normKey } = await import("@/lib/scraper/epg.server");
          let q = supabaseAdmin
            .from("autonomous_streams")
            .select("id,title,category,stream_url,poster_image_url,quality_tier,custom_headers")
            .eq("status", "active")
            .eq("type", type)
            .order("priority", { ascending: false })
            .limit(5000);
          if (quality) q = q.eq("quality_tier", quality.toUpperCase());
          const { data } = await q;

          const lines = ["#EXTM3U"];
          for (const s of data ?? []) {
            const headers = (s.custom_headers ?? {}) as Record<string, string>;
            lines.push(
              `#EXTINF:-1 tvg-id="${normKey(s.title)}" tvg-name="${s.title.replace(/"/g, "")}" tvg-logo="${s.poster_image_url ?? ""}" group-title="${s.category ?? "Diğer"}",${s.title}`,
            );
            if (!proxied) {
              if (headers.Referer) lines.push(`#EXTVLCOPT:http-referrer=${headers.Referer}`);
              if (headers["User-Agent"]) lines.push(`#EXTVLCOPT:http-user-agent=${headers["User-Agent"]}`);
            }
            lines.push(proxied ? `${url.origin}/api/public/v1/stream/${s.id}?key=${encodeURIComponent(apiKey)}` : s.stream_url);
          }
          return { body: lines.join("\n"), contentType: "audio/x-mpegurl" };
        });

        return new Response(body, {
          headers: { ...CORS, "Content-Type": contentType, "Content-Disposition": 'inline; filename="playlist.m3u"', "Cache-Control": "private, max-age=30" },
        });
      },
    },
  },
});
