import baseWorker from "./index.js";
import { handleYUTorahSearchV2 } from "./yutorah-search-v2.js";

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
