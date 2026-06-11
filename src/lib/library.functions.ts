import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type LibraryItem = {
  id: string;
  source_url: string;
  stream_url: string;
  title: string;
  kind: "dizi" | "film" | "canli";
  season: number | null;
  episode: number | null;
  episode_name: string | null;
  year: number | null;
  thumbnail: string | null;
  is_alive: boolean;
  last_checked_at: string;
  created_at: string;
};

export const listLibrary = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("media_items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("listLibrary error", error);
    return { items: [] as LibraryItem[] };
  }
  return { items: (data || []) as LibraryItem[] };
});

export const reverifyLibrary = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { probeMany } = await import("./probe.server");

  const { data: rows } = await supabaseAdmin
    .from("media_items")
    .select("id, stream_url")
    .limit(500);

  if (!rows || rows.length === 0) return { ok: true, checked: 0, alive: 0 };

  const urls = rows.map((r) => r.stream_url);
  const map = await probeMany(urls, 8);
  let alive = 0;

  await Promise.all(
    rows.map(async (r) => {
      const isAlive = map.get(r.stream_url) ?? false;
      if (isAlive) alive++;
      await supabaseAdmin
        .from("media_items")
        .update({ is_alive: isAlive, last_checked_at: new Date().toISOString() })
        .eq("id", r.id);
    }),
  );

  return { ok: true, checked: rows.length, alive };
});

export const deleteDeadItems = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error, count } = await supabaseAdmin
    .from("media_items")
    .delete({ count: "exact" })
    .eq("is_alive", false);
  if (error) return { ok: false, error: error.message };
  return { ok: true, removed: count ?? 0 };
});

export const clearLibrary = createServerFn({ method: "POST" })
  .inputValidator(z.object({ confirm: z.literal(true) }))
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("media_items").delete().not("id", "is", null);
    return { ok: true };
  });
