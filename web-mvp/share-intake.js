(() => {
  const SUPPORTED_HOSTS = ["yutorah.org", "kolhalashon.com"];

  function isSupportedUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase();
      return SUPPORTED_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }

  function findUrlInText(value) {
    const text = String(value || "");
    for (const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)) {
      const candidate = match[0].replace(/[),.;!?]+$/, "");
      if (isSupportedUrl(candidate)) return candidate;
    }
    return "";
  }

  function sharedUrlFromLocation() {
    const params = new URLSearchParams(location.search);
    const direct = params.get("url") || params.get("sourceUrl") || "";
    if (isSupportedUrl(direct)) return direct;

    for (const key of ["text", "title"]) {
      const found = findUrlInText(params.get(key));
      if (found) return found;
    }
    return "";
  }

  function clearShareParameters() {
    const clean = new URL(location.href);
    ["url", "sourceUrl", "text", "title", "share"].forEach(key => clean.searchParams.delete(key));
    if (clean.pathname === "/share-target" || clean.pathname === "/share-target/") clean.pathname = "/";
    history.replaceState({}, "", `${clean.pathname}${clean.search}${clean.hash}`);
  }

  async function receiveSharedLecture() {
    const sharedUrl = sharedUrlFromLocation();
    if (!sharedUrl) return;

    clearShareParameters();

    // app.js defines startFromUrl. Defer execution one frame so the base app
    // has completed its initial render and dialog bindings first.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (typeof startFromUrl !== "function") {
      console.error("Shiur Notes share intake could not find startFromUrl().");
      return;
    }

    try {
      await startFromUrl(sharedUrl);
      if (typeof showToast === "function") showToast("Shared shiur received");
    } catch (error) {
      console.error("Could not receive shared shiur", error);
      if (typeof showToast === "function") showToast("Could not open the shared shiur");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", receiveSharedLecture, { once: true });
  } else {
    receiveSharedLecture();
  }
})();
