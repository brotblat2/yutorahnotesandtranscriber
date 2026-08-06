const CACHE_NAME = "shiur-notes-web-v23";
const ASSETS = ["./", "./index.html", "./styles.css", "./extension-theme.css", "./app.js", "./home-shortcut-v23.js?v=23", "./state-bridge.js", "./link-resolver.js", "./production-api.js", "./share-intake.js?v=21", "./ui-polish-v20.js?v=22", "./export-tools.js", "./pdf-export-v18.js?v=18", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" }).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
