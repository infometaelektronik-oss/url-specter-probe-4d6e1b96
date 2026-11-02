import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
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
  let calls = 0;
  const request = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    assert.equal(input, "https://ai.gateway.lovable.dev/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "google/gemini-3.1-flash-lite");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages.length, 2);
    assert.equal(body.max_tokens, undefined);
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  };
  globalThis.fetch = request as typeof fetch;
  assert.deepEqual(await classifyContent({ title: "Örnek Film", streamUrl: "https://example.org/film.m3u8" }), result);
  assert.equal(calls, 1);
});

test("classification preserves the fallback without retrying a denied call", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  let calls = 0;
  const request = async () => { calls += 1; return new Response("Denied", { status: 403 }); };
  globalThis.fetch = request as typeof fetch;
  assert.equal(await classifyContent({ streamUrl: "https://example.org/film.m3u8" }), null);
  assert.equal(calls, 1);
});