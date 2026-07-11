// UI'nin çağırdığı server function'lar (manuel trigger + stats).
import { createServerFn } from "@tanstack/react-start";

export const triggerDiscovery = createServerFn({ method: "POST" }).handler(async () => {
  const { runDiscovery } = await import("./orchestrator.server");
  const s = await runDiscovery({ manual: true });
  return { ok: true, summary: s };
});

export const triggerHealth = createServerFn({ method: "POST" }).handler(async () => {
  const { runHealthCheck } = await import("./orchestrator.server");
  const s = await runHealthCheck();
  return { ok: true, summary: s };
});

export const getScraperStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [total, active, inactive, todayNew, killedToday] = await Promise.all([
    supabaseAdmin.from("autonomous_streams").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("autonomous_streams")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("autonomous_streams")
      .select("id", { count: "exact", head: true })
      .eq("status", "inactive"),
    supabaseAdmin
      .from("autonomous_streams")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.toISOString()),
    supabaseAdmin
      .from("autonomous_streams")
      .select("id", { count: "exact", head: true })
      .eq("status", "inactive")
      .gte("updated_at", today.toISOString()),
  ]);
  return {
    ok: true,
    stats: {
      total: total.count ?? 0,
      active: active.count ?? 0,
      inactive: inactive.count ?? 0,
      todayNew: todayNew.count ?? 0,
      killedToday: killedToday.count ?? 0,
    },
  };
});

export const getChoicelyConfigStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    hasUrl: !!process.env.CHOICELY_API_URL,
    hasKey: !!process.env.CHOICELY_API_KEY,
  };
});
