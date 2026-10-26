/* SpaceViewer — serve uploaded LCC packages from Cache Storage. */
const CACHE_PREFIX = "sv-pkg-";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/sv-pkg/")) return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return new Response(`Not in package cache: ${url.pathname}`, { status: 404 });
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "drop-cache") return;
  const name = CACHE_PREFIX + data.id;
  event.waitUntil(caches.delete(name));
});
