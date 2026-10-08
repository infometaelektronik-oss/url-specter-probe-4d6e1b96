import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/epg.xml")({
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

        const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
        const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";

        const { body, contentType } = await cached("epg:xml", 600, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("epg_programs")
            .select("channel_key,channel_name,title,description,start_at,stop_at")
            .gte("stop_at", new Date().toISOString())
            .order("start_at")
            .limit(20000);
          const channels = new Map<string, string>();
          for (const p of data ?? []) channels.set(p.channel_key, p.channel_name ?? p.channel_key);
          const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="Core Stream Engine">'];
          for (const [k, name] of channels) out.push(`<channel id="${esc(k)}"><display-name>${esc(name)}</display-name></channel>`);
          for (const p of data ?? []) {
            out.push(
              `<programme start="${stamp(p.start_at)}" stop="${stamp(p.stop_at)}" channel="${esc(p.channel_key)}"><title>${esc(p.title)}</title>${p.description ? `<desc>${esc(p.description)}</desc>` : ""}</programme>`,
            );
          }
          out.push("</tv>");
          return { body: out.join("\n"), contentType: "application/xml" };
        });

        return new Response(body, { headers: { ...CORS, "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
      },
    },
  },
});
