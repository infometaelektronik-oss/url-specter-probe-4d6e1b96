// Choicely Sync Service — push/delete Choicely'e her yeni/değişen kayıt gönderilir.
type StreamPayload = {
  title: string;
  type: "live_tv" | "movie" | "series" | "radio";
  source: string;
  category: string;
  poster_image_url: string | null;
  video_stream_url: string;
  is_active: boolean;
  custom_headers?: Record<string, string>;
  resolution?: string;
};

export async function pushToChoicely(
  payload: StreamPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const url = process.env.CHOICELY_API_URL;
  const key = process.env.CHOICELY_API_KEY;
  if (!url || !key) return { ok: false, error: "Choicely credentials missing" };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) return { ok: false, error: `${r.status}: ${text.slice(0, 200)}` };
    let id: string | undefined;
    try {
      const j = JSON.parse(text) as { id?: string; _id?: string };
      id = j.id || j._id;
    } catch {
      /* body may be empty */
    }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deactivateOnChoicely(
  choicelyId: string | null,
  streamUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.CHOICELY_API_URL;
  const key = process.env.CHOICELY_API_KEY;
  if (!url || !key) return { ok: false, error: "Choicely credentials missing" };
  try {
    // Choicely genelde POST-idempotent ingest kabul eder; is_active:false ile update ederiz.
    const target = choicelyId ? `${url.replace(/\/$/, "")}/${choicelyId}` : url;
    const r = await fetch(target, {
      method: choicelyId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
      body: JSON.stringify({ video_stream_url: streamUrl, is_active: false }),
    });
    if (!r.ok) return { ok: false, error: `${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
