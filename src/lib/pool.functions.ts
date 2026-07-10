import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listPoolSites = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("pool_sites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message, items: [] };
  return { ok: true as const, items: data ?? [] };
});

export const addPoolSite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        url: z.string().url(),
        label: z.string().min(1).max(200),
        kind: z.enum(["dizi", "film", "canli", "auto"]).default("auto"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("pool_sites")
      .upsert({ url: data.url, label: data.label, kind: data.kind, active: true }, { onConflict: "url" })
      .select()
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, item: row };
  });

export const removePoolSite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pool_sites").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listPoolMedia = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("media_items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false as const, error: error.message, items: [] };
  return { ok: true as const, items: data ?? [] };
});
