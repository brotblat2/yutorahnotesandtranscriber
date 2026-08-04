(() => {
  const nativeFetch = window.fetch.bind(window);
  const PAGE_PROXY = "https://api.allorigins.win/raw?url=";
  const BINARY_PROXY = "https://corsproxy.io/?url=";

  function kolHalashonMp3(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/kolhalashon\.com$/i.test(parsed.hostname) && !/\.kolhalashon\.com$/i.test(parsed.hostname)) return null;
      if (!/PlayShiur\.aspx/i.test(parsed.pathname)) return null;
      const raw = parsed.searchParams.get("FileName");
      if (!/^\d+$/.test(raw || "")) return null;
      const id = raw.padStart(8, "0");
      const folder = id.slice(0, 5);
      return `https://www.kolhalashon.com/mp3/NewArchive/${folder}/${id}.mp3`;
    } catch {
      return null;
    }
  }

  function isYuPage(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)yutorah\.org$/i.test(parsed.hostname) && !/download\.yutorah\.org/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isAudioUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /\.mp3(?:$|\?)/i.test(parsed.href) || /download\.yutorah\.org$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  async function fetchTextThroughProxy(url, init) {
    const proxied = PAGE_PROXY + encodeURIComponent(String(url));
    const response = await nativeFetch(proxied, { ...init, method: "GET", body: undefined });
    if (!response.ok) throw new Error(`Metadata proxy failed (${response.status})`);
    return response;
  }

  window.fetch = async function resolvedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const kolMp3 = kolHalashonMp3(url);

    if (kolMp3) {
      const html = `<html><body><audio src="${kolMp3}"></audio><a href="${kolMp3}">Download MP3</a></body></html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "X-Shiur-Resolved-Audio": kolMp3 }
      });
    }

    try {
      return await nativeFetch(input, init);
    } catch (error) {
      if (isYuPage(url)) {
        return fetchTextThroughProxy(url, init);
      }
      if (isAudioUrl(url)) {
        const proxied = BINARY_PROXY + encodeURIComponent(String(url));
        return nativeFetch(proxied, { ...init, method: "GET", body: undefined });
      }
      throw error;
    }
  };

  window.ShiurLinkResolver = { kolHalashonMp3 };
})();
