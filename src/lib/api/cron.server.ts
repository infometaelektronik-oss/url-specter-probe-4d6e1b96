// Verifies scheduled-job callers using the internal token stored in engine_settings.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function verifyCron(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const given = request.headers.get("x-cron-token") ?? url.searchParams.get("token") ?? "";
  if (!given) return false;
  const { data } = await supabaseAdmin.from("engine_settings").select("value").eq("key", "cron_token").maybeSingle();
  const expected = typeof data?.value === "string" ? data.value : "";
  if (!expected || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Runs a scheduled task and records start, finish (with duration) or failure in scraper_logs. */
export async function loggedRun(task: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  await supabaseAdmin.from("scraper_logs").insert({ level: "info", phase: "cron", message: `Zamanlı ${task} başladı`, meta: { task } as never });
  try {
    const result = await fn();
    const summary = result && typeof result === "object"
      ? Object.fromEntries(Object.entries(result as Record<string, unknown>).filter(([, v]) => typeof v === "number"))
      : {};
    await supabaseAdmin.from("scraper_logs").insert({
      level: "ok", phase: "cron",
      message: `Zamanlı ${task} bitti (${Math.round((Date.now() - t0) / 1000)} sn) ${JSON.stringify(summary)}`,
      meta: { task, ms: Date.now() - t0, ...summary } as never,
    });
    return json({ ok: true, task, summary });
  } catch (e) {
    await supabaseAdmin.from("scraper_logs").insert({ level: "error", phase: "cron", message: `Zamanlı ${task} hata: ${(e as Error).message}`, meta: { task } as never });
    return json({ ok: false, task, error: (e as Error).message }, 500);
  }
}
