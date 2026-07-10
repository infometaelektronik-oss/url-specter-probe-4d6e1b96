import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `Sen Türk medya/canlı yayın/film/dizi web sitelerini iyi bilen bir keşif asistanısın.
Kullanıcının verdiği tür/tema için, halka açık, yasal veya kamuya açık Türk yayıncı sitelerinden (kanald, startv, showtv, atv, trtizle, nowtv, puhutv, tv8 vb.) uygun URL önerileri döndür.
Yalnızca gerçek, hâlihazırda erişilebilir kök URL'ler ver. Her önerinin kısa etiketi ve türü (dizi/film/canli) olsun.`;

export const discoverSites = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ topic: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "LOVABLE_API_KEY yok.", items: [] };

    const tool = {
      type: "function",
      function: {
        name: "emit_sites",
        description: "Önerilen site listesi",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  label: { type: "string" },
                  kind: { type: "string", enum: ["dizi", "film", "canli", "auto"] },
                },
                required: ["url", "label", "kind"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    } as const;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Konu / tema: ${data.topic}\nEn fazla 12 öneri.` },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_sites" } },
      }),
    });

    if (res.status === 429) return { ok: false as const, error: "AI hız limiti.", items: [] };
    if (res.status === 402) return { ok: false as const, error: "AI kredisi bitti.", items: [] };
    if (!res.ok) return { ok: false as const, error: `AI ${res.status}`, items: [] };

    const j = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}";
    let parsed: { items?: unknown } = {};
    try {
      parsed = JSON.parse(args);
    } catch {
      /* ignore */
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return { ok: true as const, items };
  });
