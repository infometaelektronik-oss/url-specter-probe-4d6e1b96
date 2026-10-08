import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/streams")({
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
        const type = url.searchParams.get("type");
        const category = url.searchParams.get("category");
        const quality = url.searchParams.get("quality");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000) || 1000, 5000);
        const key = `streams:${type ?? ""}:${category ?? ""}:${quality ?? ""}:${limit}`;

        const { body, contentType, hit } = await cached(key, 60, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let q = supabaseAdmin
            .from("autonomous_streams")
            .select("id,title,type,category,stream_url,poster_image_url,resolution,quality_tier,bitrate_kbps,custom_headers,source,failover_group,geo_country,last_checked_at")
            .eq("status", "active")
            .order("priority", { ascending: false })
            .limit(limit);
          if (type) q = q.eq("type", type);
          if (category) q = q.eq("category", category);
          if (quality) q = q.eq("quality_tier", quality.toUpperCase());
          const { data } = await q;
          return {
            body: JSON.stringify({ count: data?.length ?? 0, generated_at: new Date().toISOString(), streams: data ?? [] }),
            contentType: "application/json",
          };
        });

        return new Response(body, {
          headers: { ...CORS, "Content-Type": contentType, "Cache-Control": "private, max-age=30", "X-Cache": hit ? "HIT" : "MISS" },
        });
      },
    },
  },
});
