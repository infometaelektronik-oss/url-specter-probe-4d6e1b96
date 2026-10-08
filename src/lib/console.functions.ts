// Admin console server functions. Every call requires a signed-in admin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Bu işlem için yönetici yetkisi gerekli");
}

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("claim_first_admin");
    return { isAdmin: !!data };
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const db = context.supabase;
    const since = new Date(Date.now() - 86400000).toISOString();
    const [total, active, inactive, queued, failed, metrics, logs, tiers] = await Promise.all([
      db.from("autonomous_streams").select("id", { count: "exact", head: true }),
      db.from("autonomous_streams").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("autonomous_streams").select("id", { count: "exact", head: true }).eq("status", "inactive"),
      db.from("crawl_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
      db.from("crawl_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      db.from("engine_metrics").select("ts,kind,requests,success,failed,banned,avg_ms,found").order("ts", { ascending: false }).limit(48),
      db.from("scraper_logs").select("id,created_at,level,phase,message").order("created_at", { ascending: false }).limit(80),
      db.from("autonomous_streams").select("quality_tier,category").eq("status", "active").limit(5000),
    ]);
    const tierCount: Record<string, number> = {};
    const catCount: Record<string, number> = {};
    for (const r of tiers.data ?? []) {
      tierCount[r.quality_tier ?? "unknown"] = (tierCount[r.quality_tier ?? "unknown"] ?? 0) + 1;
      catCount[r.category ?? "Diğer"] = (catCount[r.category ?? "Diğer"] ?? 0) + 1;
    }
    return {
      counts: {
        total: total.count ?? 0, active: active.count ?? 0, inactive: inactive.count ?? 0,
        queued: queued.count ?? 0, failedJobs: failed.count ?? 0,
      },
      metrics: (metrics.data ?? []).reverse(),
      logs: logs.data ?? [],
      tiers: tierCount,
      categories: catCount,
    };
  });

export const listStreams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string; status?: string; tier?: string }) =>
    z.object({ q: z.string().max(100).optional(), status: z.string().max(20).optional(), tier: z.string().max(10).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    let q = context.supabase
      .from("autonomous_streams")
      .select("id,title,type,category,stream_url,quality_tier,resolution,bitrate_kbps,response_ms,status,failure_count,source,priority,last_checked_at,failover_group")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.status) q = q.eq("status", data.status);
    if (data.tier) q = q.eq("quality_tier", data.tier);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const updateStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; priority?: number; status?: string; remove?: boolean }) =>
    z.object({ id: z.string().uuid(), priority: z.number().int().min(-100).max(1000).optional(), status: z.enum(["active", "inactive"]).optional(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    if (data.remove) {
      await context.supabase.from("autonomous_streams").delete().eq("id", data.id);
    } else {
      const patch: Record<string, unknown> = {};
      if (data.priority !== undefined) patch.priority = data.priority;
      if (data.status) { patch.status = data.status; patch.is_active = data.status === "active"; }
      await context.supabase.from("autonomous_streams").update(patch as never).eq("id", data.id);
    }
    return { ok: true };
  });

export const runEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { task: "discover" | "worker" | "health" | "epg" }) =>
    z.object({ task: z.enum(["discover", "worker", "health", "epg"]) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    if (data.task === "epg") {
      const { syncEpg } = await import("@/lib/scraper/epg.server");
      return { task: data.task, result: await syncEpg() };
    }
    const o = await import("@/lib/scraper/orchestrator.server");
    if (data.task === "discover") {
      const r = await o.runDiscovery({ manual: true });
      return { task: data.task, result: { enqueued: r.enqueued, inserted: r.inserted, validated: r.validated } };
    }
    if (data.task === "worker") {
      const r = await o.runWorker({ batch: 10 });
      return { task: data.task, result: { pages: r.pages, inserted: r.inserted, validated: r.validated } };
    }
    return { task: data.task, result: await o.runHealthCheck() };
  });

// ---------- Generic admin resources ----------
export const getResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const db = context.supabase;
    const [proxies, clients, hooks, epg, queries] = await Promise.all([
      db.from("proxies").select("*").order("created_at", { ascending: false }),
      db.from("api_clients").select("id,name,key_prefix,ip_whitelist,rate_limit_per_min,active,request_count,last_used_at,created_at").order("created_at", { ascending: false }),
      db.from("webhooks").select("*").order("created_at", { ascending: false }),
      db.from("epg_sources").select("*").order("created_at", { ascending: false }),
      db.from("discovery_queries").select("id,engine,query,active,hit_count,last_run_at").order("hit_count", { ascending: false }).limit(200),
    ]);
    return {
      proxies: proxies.data ?? [],
      clients: clients.data ?? [],
      webhooks: hooks.data ?? [],
      epg: epg.data ?? [],
      queries: queries.data ?? [],
      captchaReady: !!process.env.CAPTCHA_API_KEY,
    };
  });

export const addProxy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { label: string; template: string; country?: string }) =>
    z.object({
      label: z.string().min(1).max(60),
      template: z.string().url().max(500).refine((v) => v.includes("{url}") || v.includes("{rawUrl}"), "Şablonda {url} olmalı"),
      country: z.string().length(2).optional().or(z.literal("")),
    }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    await context.supabase.from("proxies").insert({ label: data.label, template: data.template, country: data.country ? data.country.toUpperCase() : null });
    return { ok: true };
  });

export const createApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; ips: string; rate: number }) =>
    z.object({ name: z.string().min(1).max(60), ips: z.string().max(1000), rate: z.number().int().min(1).max(10000) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    const { generateApiKey, sha256 } = await import("@/lib/api/auth.server");
    const key = generateApiKey();
    const ips = data.ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    await context.supabase.from("api_clients").insert({
      name: data.name, key_hash: await sha256(key), key_prefix: key.slice(0, 14), ip_whitelist: ips, rate_limit_per_min: data.rate,
    });
    return { key };
  });

export const addWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; kind: string; url: string; chatId?: string }) =>
    z.object({ name: z.string().min(1).max(60), kind: z.enum(["discord", "telegram", "generic"]), url: z.string().min(8).max(500), chatId: z.string().max(40).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    await context.supabase.from("webhooks").insert({ name: data.name, kind: data.kind, url: data.url, telegram_chat_id: data.chatId || null });
    return { ok: true };
  });

export const testWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { notify } = await import("@/lib/scraper/webhooks.server");
    await notify("run_done", "Test bildirimi", "Core Stream Engine bağlantısı çalışıyor.");
    return { ok: true };
  });

export const addEpgSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().url().max(500) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    await context.supabase.from("epg_sources").insert({ url: data.url });
    return { ok: true };
  });

export const addQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { engine: string; query: string }) =>
    z.object({ engine: z.enum(["duckduckgo", "github"]), query: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    await context.supabase.from("discovery_queries").insert({ engine: data.engine, query: data.query, active: true } as never);
    return { ok: true };
  });

const TABLES = ["proxies", "api_clients", "webhooks", "epg_sources", "discovery_queries"] as const;

export const toggleResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string; id: string; active?: boolean; remove?: boolean }) =>
    z.object({ table: z.enum(TABLES), id: z.string().uuid(), active: z.boolean().optional(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Ctx);
    const t = context.supabase.from(data.table);
    if (data.remove) await t.delete().eq("id", data.id);
    else await t.update({ active: !!data.active } as never).eq("id", data.id);
    return { ok: true };
  });
