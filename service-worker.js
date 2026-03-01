/* Glen Track SW — cache-busted version */
const CACHE = "glentrack-cache-v2026.03.02";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css?v=2026.03.01",
  "./app.js?v=2026.03.01",
  "./manifest.json?v=2026.03.01",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(()=>{})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached || caches.match("./index.html"));
    })
  );
});