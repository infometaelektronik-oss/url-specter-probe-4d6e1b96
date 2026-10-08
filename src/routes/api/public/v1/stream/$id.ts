import { createFileRoute } from "@tanstack/react-router";

// Stream rewriter + token injector + smart failover.
// Serves an m3u8 whose child URLs point back here, so required headers/tokens are injected
// on every segment request. If the primary source dies, a mirror in the same failover group is used.
export const Route = createFileRoute("/api/public/v1/stream/$id")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { CORS } = await import("@/lib/api/auth.server");
        return new Response(null, { status: 204, headers: CORS });
      },
      GET: async ({ request, params }) => {
        const { authenticateRequest, errorResponse, CORS } = await import("@/lib/api/auth.server");
        const auth = await authenticateRequest(request);
        if (!auth.ok) return errorResponse(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { smartFetch } = await import("@/lib/scraper/fetch.server");

        const reqUrl = new URL(request.url);
        const apiKey = request.headers.get("x-api-key") ?? reqUrl.searchParams.get("key") ?? "";
        const override = reqUrl.searchParams.get("u");

        const { data: row } = await supabaseAdmin
          .from("autonomous_streams")
          .select("id,stream_url,custom_headers,failover_group,source_website,geo_country")
          .eq("id", params.id)
          .maybeSingle();
        if (!row) return new Response(JSON.stringify({ error: "Stream not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

        const headers = (row.custom_headers ?? {}) as Record<string, string>;
        const candidates: string[] = [];
        if (override) {
          try {
            candidates.push(new URL(override, row.stream_url).toString());
          } catch {
            /* ignore */
          }
        } else {
          candidates.push(row.stream_url);
          if (row.failover_group) {
            const { data: mirrors } = await supabaseAdmin
              .from("autonomous_streams")
              .select("stream_url")
              .eq("failover_group", row.failover_group)
              .eq("status", "active")
              .neq("id", row.id)
              .limit(4);
            for (const m of mirrors ?? []) candidates.push(m.stream_url);
          }
        }

        for (const target of candidates) {
          const res = await smartFetch(target, {
            timeoutMs: 12000,
            kind: "media",
            referer: headers.Referer ?? row.source_website ?? undefined,
            extraHeaders: headers,
            country: row.geo_country,
            attempts: 2,
          });
          if (res.status < 200 || res.status >= 400 || !res.text) continue;

          const base = `${reqUrl.origin}/api/public/v1/stream/${row.id}?key=${encodeURIComponent(apiKey)}&u=`;
          if (res.text.includes("#EXTM3U")) {
            const rewritten = res.text
              .split("\n")
              .map((line) => {
                const t = line.trim();
                if (!t || t.startsWith("#")) {
                  return t.replace(/URI="([^"]+)"/g, (_m, u: string) => {
                    try {
                      return `URI="${base}${encodeURIComponent(new URL(u, target).toString())}"`;
                    } catch {
                      return _m;
                    }
                  });
                }
                try {
                  return `${base}${encodeURIComponent(new URL(t, target).toString())}`;
                } catch {
                  return t;
                }
              })
              .join("\n");
            return new Response(rewritten, {
              headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
            });
          }

          // Non-manifest payload (segment / media): stream it through unchanged.
          const upstream = await fetch(target, { headers: { ...headers, "User-Agent": headers["User-Agent"] ?? "VLC/3.0.20 LibVLC/3.0.20" } });
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              ...CORS,
              "Content-Type": upstream.headers.get("content-type") ?? "video/mp2t",
              "Cache-Control": "no-store",
            },
          });
        }

        return new Response(JSON.stringify({ error: "All sources unavailable" }), {
          status: 502,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
