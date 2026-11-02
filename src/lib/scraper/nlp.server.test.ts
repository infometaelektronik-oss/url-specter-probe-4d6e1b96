import { afterEach, expect, mock, test } from "bun:test";
import { classifyContent } from "./nlp.server";

const originalFetch = globalThis.fetch;
const originalKey = process.env.LOVABLE_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = originalKey;
});

test("classification uses the active lightweight model and preserves its JSON contract", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  const result = { title: "Örnek Film", type: "movie", category: "Sinema", quality: "1080p" };
  const request = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(input).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("google/gemini-3.1-flash-lite");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toHaveLength(2);
    expect(body.max_tokens).toBeUndefined();
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  });
  globalThis.fetch = request as typeof fetch;
  expect(await classifyContent({ title: "Örnek Film", streamUrl: "https://example.org/film.m3u8" })).toEqual(result);
  expect(request).toHaveBeenCalledTimes(1);
});

test("classification preserves the fallback without retrying a denied call", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  const request = mock(async () => new Response("Denied", { status: 403 }));
  globalThis.fetch = request as typeof fetch;
  expect(await classifyContent({ streamUrl: "https://example.org/film.m3u8" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});