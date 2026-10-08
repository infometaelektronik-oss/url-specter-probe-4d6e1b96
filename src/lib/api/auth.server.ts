// External API client authentication: hashed keys, IP whitelist, per-minute rate limiting.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sk_live_${body}`;
}

export type AuthOk = { ok: true; clientId: string; name: string };
export type AuthErr = { ok: false; status: number; message: string };

export function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    ""
  );
}

export async function authenticateRequest(request: Request): Promise<AuthOk | AuthErr> {
  const url = new URL(request.url);
  const raw =
    request.headers.get("x-api-key") ||
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("key") ||
    "";
  if (!raw) return { ok: false, status: 401, message: "API key required" };

  const hash = await sha256(raw);
  const { data: client } = await supabaseAdmin
    .from("api_clients")
    .select("id,name,active,ip_whitelist,rate_limit_per_min")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!client || !client.active) return { ok: false, status: 401, message: "Invalid API key" };

  const ip = clientIp(request);
  if (client.ip_whitelist?.length && ip && !client.ip_whitelist.includes(ip)) {
    return { ok: false, status: 403, message: "IP not allowed" };
  }

  const { data: allowed } = await supabaseAdmin.rpc("api_hit", {
    _client: client.id,
    _limit: client.rate_limit_per_min,
  });
  if (allowed === false) return { ok: false, status: 429, message: "Rate limit exceeded" };

  return { ok: true, clientId: client.id, name: client.name };
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
};

export function errorResponse(e: AuthErr) {
  return new Response(JSON.stringify({ error: e.message }), {
    status: e.status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Database-backed response cache (Redis substitute on the worker runtime). */
export async function cached(
  key: string,
  ttlSeconds: number,
  build: () => Promise<{ body: string; contentType: string }>,
): Promise<{ body: string; contentType: string; hit: boolean }> {
  const { data } = await supabaseAdmin.from("feed_cache").select("body,content_type,expires_at").eq("key", key).maybeSingle();
  if (data && new Date(data.expires_at).getTime() > Date.now()) {
    return { body: data.body, contentType: data.content_type, hit: true };
  }
  const built = await build();
  await supabaseAdmin.from("feed_cache").upsert({
    key,
    body: built.body,
    content_type: built.contentType,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  });
  return { ...built, hit: false };
}
