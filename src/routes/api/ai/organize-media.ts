import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Using the more detailed SYSTEM prompt from organize.functions.ts
const SYSTEM_PROMPT = `Sen bir Türk medya kategorizasyon motorusun. Sana ham link listesi verilir (sayfa başlığı + URL + opsiyonel akış). Görevlerin:
1) Fragman / kısa video / "shorts" / "tanıtım" / 5 dakikadan kısa içerikleri ELE.
2) Kalan içerikleri "dizi" | "film" | "canli" olarak sınıflandır.
3) Dizi bölümleri için diziAdı + sezon + bölüm numarasını başlıktan/URL'den çıkar; bölüm ismini netleştir.
4) Canlı kanal isimlerini (Kanal D, Star, ATV, Show, TRT 1, NOW, FOX vb.) normalize et.
5) Filmler için yıl bilgisi mümkünse ekle.
SADECE şu JSON ŞEMASIYLA tool döndür: items: [{type, title, season?, episode?, episodeName?, year?, url}]. Boş kalanlara null koy. URL alanı orijinal kaynak linkidir, asla uydurma.`;

// Define the tool schema based on organize.functions.ts
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

export const Route = createFileRoute("/api/ai/organize-media")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          // Expecting rawM3uData in the request body
          const raw = (body as { rawM3uData?: unknown }).rawM3uData;
          if (raw === undefined || raw === null)
            return new Response(
              JSON.stringify({ error: "rawM3uData eksik." }),
              { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
            );

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey)
            return new Response(
              JSON.stringify({ error: "AI gateway anahtarı yapılandırılmamış." }),
              { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
            );

          // Prepare the user message for the AI
          const payloadStr =
            typeof raw === "string" ? raw : JSON.stringify(raw);
          const truncated = payloadStr.slice(0, 60000); // Limit payload size

          const userMsg = JSON.stringify({
             // Assuming rawM3uData could be an object with rootUrl and items
            rootUrl: (body as any).rootUrl,
            items: JSON.parse(truncated), // Assuming raw is JSON string
            rootStreams: (body as any).rootStreams
          });

          const aiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userMsg }, // Use the prepared user message
                ],
                tools: [tool],
                tool_choice: { type: "function", function: { name: "emit_media" } }, // Specify tool choice
              }),
            },
          );

          // Handle specific AI gateway errors
          if (aiRes.status === 429)
            return new Response(
              JSON.stringify({ error: "AI hız limiti aşıldı, biraz sonra tekrar dene." }),
              { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
            );
          if (aiRes.status === 402)
            return new Response(
              JSON.stringify({ error: "AI kredisi bitti, workspace bakiyesi ekleyin." }),
              { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
            );
          if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error("AI gateway error:", aiRes.status, errText);
            return new Response(
              JSON.stringify({ error: "Yapay zeka isimlendirme ve kategori motoru kilitlendi." }),
              { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
            );
          }

          const ai = (await aiRes.json()) as {
            choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string } }[];
          };

          // Extract arguments from tool_calls or fallback to content
          const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? ai.choices?.[0]?.message?.content ?? "{}";
          
          let parsed: { items?: unknown } = {};
          try {
            parsed = JSON.parse(args);
          } catch (e) {
            console.error("JSON parsing error:", e);
            console.error("Malformed JSON response:", args);
            // Attempt to extract JSON if it's wrapped in other text
            const m = args.match(/\{[\s\S]*\}/);
            if (m) {
              try {
                parsed = JSON.parse(m[0]);
              } catch {}
            }
          }

          // Ensure parsed.items is an array
          const items = Array.isArray(parsed.items) ? parsed.items : [];

          return new Response(
            JSON.stringify({ success: true, data: items }), // Return data field with items array
            { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (e) {
          console.error("organize-media error:", e);
          return new Response(
            JSON.stringify({ error: "Yapay zeka isimlendirme ve kategori motoru kilitlendi." }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
