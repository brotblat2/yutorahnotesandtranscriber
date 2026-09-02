(() => {
  if (globalThis.__shiurNotesGeminiCompatInstalled) return;
  globalThis.__shiurNotesGeminiCompatInstalled = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const replacements = new Map([
    ["gemini-2.5-flash", "gemini-3.5-flash"],
    ["gemini-3-flash-preview", "gemini-3.6-flash"]
  ]);

  function normalizeUrl(value) {
    const url = String(value || "");
    if (!url.includes("generativelanguage.googleapis.com") || !url.includes(":generateContent")) return url;
    let next = url;
    for (const [oldModel, newModel] of replacements) {
      next = next.replace(`/models/${oldModel}:generateContent`, `/models/${newModel}:generateContent`);
    }
    return next;
  }

  function normalizeBody(body) {
    if (typeof body !== "string") return body;
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
      return JSON.stringify(data);
    } catch {
      return body;
    }
  }

  globalThis.fetch = function compatibleGeminiFetch(input, init = {}) {
    const originalUrl = typeof input === "string" ? input : input?.url;
    const url = normalizeUrl(originalUrl);
    if (!url.includes(":generateContent")) return nativeFetch(input, init);

    const nextInit = { ...init, body: normalizeBody(init?.body) };
    if (typeof input === "string") return nativeFetch(url, nextInit);
    return nativeFetch(new Request(url, input), nextInit);
  };
})();
