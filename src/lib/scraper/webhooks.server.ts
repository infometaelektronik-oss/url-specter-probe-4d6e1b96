// Alerting: Discord / Telegram / generic webhook notifications.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AlertEvent = "stream_down" | "new_source" | "run_failed" | "run_done";

export async function notify(event: AlertEvent, title: string, body: string) {
  const { data: hooks } = await supabaseAdmin
    .from("webhooks")
    .select("id,kind,url,telegram_chat_id,events")
    .eq("active", true);
  if (!hooks?.length) return;

  for (const h of hooks) {
    if (h.events?.length && !h.events.includes(event)) continue;
    try {
      let res: Response;
      if (h.kind === "discord") {
        res = await fetch(h.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [{ title, description: body.slice(0, 1800), color: event === "stream_down" ? 15158332 : 3066993 }] }),
        });
      } else if (h.kind === "telegram") {
        const url = h.url.includes("api.telegram.org") ? h.url : `https://api.telegram.org/bot${h.url}/sendMessage`;
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: h.telegram_chat_id, text: `*${title}*\n${body}`.slice(0, 3500), parse_mode: "Markdown" }),
        });
      } else {
        res = await fetch(h.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, title, body, at: new Date().toISOString() }),
        });
      }
      await supabaseAdmin.from("webhooks").update({ last_status: res.status }).eq("id", h.id);
    } catch {
      await supabaseAdmin.from("webhooks").update({ last_status: 0 }).eq("id", h.id);
    }
  }
}
