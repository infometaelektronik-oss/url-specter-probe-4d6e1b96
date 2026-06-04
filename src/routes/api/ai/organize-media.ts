import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Sen bir medya kategorizasyon motorusun. Gelen karmaşık m3u/medya havuzu verisini analiz et. Boş kategorileri, fragmanları ve kısa şovları tamamen temizle. İçerikleri 'canliYayinlar', 'filmler' ve 'diziBolumleri' olarak 3 ana kategoriye ayır. Filmleri { ad, yil, tur, url }; dizileri { diziAdi, sezon, bolum, bolumIsmi, url }; canlı yayınları { kanalAdi, kategori, url } şeklinde temizle. Sadece geçerli bir JSON döndür, başka hiçbir metin/markdown ekleme.`;

export const Route = createFileRoute("/api/ai/organize-media")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
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

          const payloadStr =
            typeof raw === "string" ? raw : JSON.stringify(raw);
          const truncated = payloadStr.slice(0, 60000);

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
                  { role: "user", content: `Veri:\n${truncated}` },
                ],
                response_format: { type: "json_object" },
              }),
            },
          );

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
            choices?: { message?: { content?: string } }[];
          };
          const text = ai.choices?.[0]?.message?.content ?? "{}";
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            const m = text.match(/\{[\s\S]*\}/);
            parsed = m ? JSON.parse(m[0]) : {};
          }

          return new Response(
            JSON.stringify({ success: true, data: parsed }),
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
