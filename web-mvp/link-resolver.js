(() => {
  const AUDIO_RE = /https?:\/\/[^"'<>\s]+\.(?:mp3|m4a|wav|aac|ogg)(?:\?[^"'<>\s]*)?/i;

  function extractAudioUrl(text, baseUrl) {
    if (!text) return null;
    const normalized = String(text)
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/g, "&");

    const downloadMatch = normalized.match(/"downloadURL"\s*:\s*"([^"]+)"/i)?.[1];
    if (downloadMatch) return new URL(downloadMatch, baseUrl).href;

    const direct = normalized.match(AUDIO_RE)?.[0];
    if (direct) return direct;

    const relative = normalized.match(/(?:href|src)=["']([^"']+\.(?:mp3|m4a|wav|aac|ogg)(?:\?[^"']*)?)["']/i)?.[1];
    if (relative) return new URL(relative, baseUrl).href;
    return null;
  }

  async function fetchTextWithFallback(targetUrl) {
    const attempts = [
      targetUrl,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];

    let lastError = null;
    for (const url of attempts) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Resolver request failed (${response.status})`);
        const text = await response.text();
        if (text) return text;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Could not load the linked page.");
  }

  function kolHalashonArchiveUrl(pageUrl) {
    try {
      const parsed = new URL(pageUrl);
      const rawId = parsed.searchParams.get("FileName");
      if (!rawId || !/^\d+$/.test(rawId)) return null;
      const padded = rawId.padStart(8, "0");
      return `https://www.kolhalashon.com/mp3/NewArchive/${padded.slice(0, 5)}/${padded}.mp3`;
    } catch {
      return null;
    }
  }

  async function robustResolveAudioUrl(pageUrl) {
    if (/\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.test(pageUrl)) return pageUrl;

    if (/kolhalashon\.com/i.test(pageUrl)) {
      const archiveUrl = kolHalashonArchiveUrl(pageUrl);
      if (archiveUrl) return archiveUrl;
    }

    if (/yutorah\.org/i.test(pageUrl)) {
      const pageHtml = await fetchTextWithFallback(pageUrl);
      const pageAudio = extractAudioUrl(pageHtml, pageUrl);
      if (pageAudio) return pageAudio;

      const id = pageUrl.match(/[?&]shiurid=(\d+)/i)?.[1]
        || pageUrl.match(/\/lectures\/(?:lecture\.cfm\/)?(\d+)/i)?.[1];
      if (id) {
        const dataUrl = `https://www.yutorah.org/sidebar/LectureData?shiurID=${id}`;
        const dataText = await fetchTextWithFallback(dataUrl);
        const dataAudio = extractAudioUrl(dataText, dataUrl);
        if (dataAudio) return dataAudio;
      }
    }

    const html = await fetchTextWithFallback(pageUrl);
    const audio = extractAudioUrl(html, pageUrl);
    if (audio) return audio;
    throw new Error("No audio file was found on the linked page.");
  }

  window.resolveAudioUrl = robustResolveAudioUrl;
})();
