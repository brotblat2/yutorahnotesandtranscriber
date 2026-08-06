import originalWorker from "./index.js";
import { handleYUTorahSearchV2 } from "./yutorah-search-v2.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/yutorah/search" && request.method === "GET") {
      return handleYUTorahSearchV2(request, env, ctx, originalWorker);
    }
    return originalWorker.fetch(request, env, ctx);
  }
};
