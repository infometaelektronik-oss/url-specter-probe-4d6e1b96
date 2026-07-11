// Madde 6: AI destekli içerik eşleştirme (Lovable AI Gateway → Gemini 2.5 Flash).
type ClassifyResult = {
  title: string;
  type: "live_tv" | "movie" | "series" | "radio";
  category: string;
  quality: string;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function classifyContent(
  hint: { title?: string; description?: string; sourceUrl?: string; streamUrl: string },
): Promise<ClassifyResult | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;

  const system =
    "Türkçe yayın/dizi/film verisi normalize eden bir asistan. Verilen ham metinden temiz JSON döndür.";
  const user = `Ham veri:
- title: ${hint.title ?? ""}
- description: ${hint.description ?? ""}
- source: ${hint.sourceUrl ?? ""}
- stream: ${hint.streamUrl}

Aşağıdaki şemayı doldur:
{ "title": "temizlenmiş standart isim", "type": "live_tv|movie|series|radio", "category": "Spor|Belgesel|Sinema|Dizi|Ulusal|Haber|Çocuk|Müzik|Radyo|Diğer", "quality": "4K|1080p|720p|480p|SD|unknown" }
Sadece JSON döndür, açıklama yok.`;

  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClassifyResult;
    return {
      title: parsed.title || hint.title || "Bilinmeyen",
      type: parsed.type || "live_tv",
      category: parsed.category || "Diğer",
      quality: parsed.quality || "unknown",
    };
  } catch {
    return null;
  }
}
