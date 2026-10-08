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
