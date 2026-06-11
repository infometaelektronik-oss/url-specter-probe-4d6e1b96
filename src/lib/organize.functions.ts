import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `Sen bir Türk medya kategorizasyon motorusun. Sana ham link listesi verilir.

KURALLAR:
1) Fragman, teaser, "tanıtım", "shorts", "preview", behind-the-scenes, jenerik, ön izleme — bunları isTrailer=true işaretle.
2) Geçerli içerikleri "dizi" | "film" | "canli" olarak sınıflandır.
3) Dizi bölümleri için diziAdı + sezon + bölüm numarasını başlıktan/URL'den çıkar.
4) Türk TV kanallarını normalize et: "Kanal D", "Star TV", "Show TV", "ATV", "TRT 1", "TRT 2", "TRT Belgesel", "NOW", "FOX", "TV8", "CNN Türk", "Habertürk", "NTV", "A Haber", "Beyaz TV", "TLC", "DMAX".
5) Filmler için mümkünse yıl bilgisi ekle (1900-2030 arası).
6) confidence 0-1: sınıflandırmadan ne kadar eminsen.
7) URL alanı orijinal kaynak linkidir, ASLA uydurma.

emit_media tool'unu kullanarak items dizisi döndür.`;

const inputSchema = z.object({
  rootUrl: z.string().url().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        streams: z.array(z.string()).optional(),
      }),
    )
    .max(400),
  rootStreams: z.array(z.string()).max(200).optional(),
});

export type AiCategorized = {
  type: "dizi" | "film" | "canli";
  title: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  year: number | null;
  url: string;
  isTrailer?: boolean;
  confidence?: number;
};

export const organizeMedia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY eksik." };

    const compact = data.items.slice(0, 250).map((i) => ({
      t: i.title.slice(0, 140),
      u: i.url,
      s: (i.streams || []).slice(0, 2),
    }));

    const userMsg = JSON.stringify({
      root: data.rootUrl,
      rootStreams: (data.rootStreams || []).slice(0, 30),
      items: compact,
    });

    const tool = {
      type: "function",
      function: {
        name: "emit_media",
        description: "Temizlenmiş kategorize medya listesi.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["dizi", "film", "canli"] },
                  title: { type: "string" },
                  season: { type: ["number", "null"] },
                  episode: { type: ["number", "null"] },
                  episodeName: { type: ["string", "null"] },
                  year: { type: ["number", "null"] },
                  url: { type: "string" },
                  isTrailer: { type: "boolean" },
                  confidence: { type: "number" },
                },
                required: ["type", "title", "url"],
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
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg.slice(0, 60000) },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_media" } },
      }),
    });

    if (res.status === 429)
      return { ok: false as const, error: "AI hız limiti aşıldı, biraz sonra dene." };
    if (res.status === 402)
      return { ok: false as const, error: "AI kredisi bitti, workspace bakiyesi ekle." };
    if (!res.ok) {
      const t = await res.text();
      console.error("AI organize error:", res.status, t);
      return { ok: false as const, error: `AI gateway ${res.status}` };
    }

    const j = (await res.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { arguments?: string } }[];
          content?: string;
        };
      }[];
    };
    const args =
      j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      j.choices?.[0]?.message?.content ??
      "{}";
    let parsed: { items?: unknown } = {};
    try {
      parsed = JSON.parse(args);
    } catch {
      const m = args.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    const items = (Array.isArray(parsed.items) ? parsed.items : []) as AiCategorized[];
    const cleaned = items.filter(
      (i) =>
        i &&
        (i.type === "dizi" || i.type === "film" || i.type === "canli") &&
        typeof i.url === "string" &&
        !i.isTrailer &&
        (i.confidence === undefined || i.confidence >= 0.4),
    );
    return { ok: true as const, items: cleaned };
  });
