import baseWorker from "./index.js";
import { handleYUTorahSearchV2 } from "./yutorah-search-v2.js";

const nativeFetch = globalThis.fetch.bind(globalThis);

function installGeminiCompatibility() {
  if (globalThis.__shiurNotesWorkerGeminiCompatInstalled) return;
  globalThis.__shiurNotesWorkerGeminiCompatInstalled = true;

  globalThis.fetch = async function compatibleGeminiFetch(input, init = {}) {
    const originalUrl = typeof input === "string" ? input : input?.url;
    let url = String(originalUrl || "");

    if (!url.includes("generativelanguage.googleapis.com") || !url.includes(":generateContent")) {
      return nativeFetch(input, init);
    }

    url = url
      .replace("/models/gemini-2.5-flash:generateContent", "/models/gemini-3.5-flash:generateContent")
      .replace("/models/gemini-3-flash-preview:generateContent", "/models/gemini-3.6-flash:generateContent");

    let body = init?.body;
    if (typeof body === "string") {
      try {
        const data = JSON.parse(body);
        const cfg = data?.generationConfig;
        if (cfg && typeof cfg === "object") {
          delete cfg.temperature;
          delete cfg.topP;
          delete cfg.top_p;
          delete cfg.topK;
          delete cfg.top_k;
          delete cfg.candidateCount;
          delete cfg.candidate_count;
        }
        body = JSON.stringify(data);
      } catch {}
    }

    const nextInit = { ...init, body };
    if (typeof input === "string") return nativeFetch(url, nextInit);
    return nativeFetch(new Request(url, input), nextInit);
  };
}

installGeminiCompatibility();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/yutorah/search" && request.method === "GET") {
      try {
        return await handleYUTorahSearchV2(request, env, ctx, baseWorker);
      } catch (error) {
        console.error("[ShiurNotes YUTorah Search]", error);
        return new Response(JSON.stringify({ ok: false, error: "YUTorah search is temporarily unavailable." }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
