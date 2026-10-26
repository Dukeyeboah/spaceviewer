/* SpaceViewer — serve uploaded LCC packages from Cache Storage.
 * The LCC SDK fetches data.bin / environment.bin with Range headers.
 * A full cached body copied into a per-node texture throws
 * RangeError: offset is out of bounds. Reply 206 with just that slice.
 */
const CACHE_PREFIX = "sv-pkg-";
const SW_VERSION = "5";
const blobs = new Map();

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
  event.respondWith(servePackage(event.request, url));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "skip-waiting") {
    self.skipWaiting();
    return;
  }
  if (data.type !== "drop-cache") return;
  const id = data.id;
  for (const key of blobs.keys()) {
    if (key.includes(`/sv-pkg/${id}/`)) blobs.delete(key);
  }
  event.waitUntil(caches.delete(CACHE_PREFIX + id));
});

async function servePackage(request, url) {
  // Match the stored URL, not the Range request itself.
  const cached = await caches.match(url.href);
  if (!cached) {
    return new Response(`Not in package cache: ${url.pathname}`, { status: 404 });
  }

  const range = request.headers.get("range");
  if (!range) {
    const headers = new Headers(cached.headers);
    headers.set("Accept-Ranges", "bytes");
    headers.set("X-SV-SW", SW_VERSION);
    return new Response(cached.body, { status: 200, headers });
  }

  const parsed = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
  const blob = await cachedBlob(url.href, cached);
  const size = blob.size;
  if (!parsed) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const start = Number(parsed[1]);
  let end = parsed[2] === "" ? size - 1 : Number(parsed[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  end = Math.min(end, size - 1);
  // Copy the slice into its own buffer. A Blob slice handed to Response
  // can still stream the whole cached file in desktop Chrome, and the SDK
  // then writes that into a small texture (RangeError: offset is out of bounds).
  const bytes = await blob.slice(start, end + 1).arrayBuffer();
  const body = bytes.slice(0);
  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(body.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "X-SV-SW": SW_VERSION,
    },
  });
}

async function cachedBlob(key, response) {
  const hit = blobs.get(key);
  if (hit) return hit;
  const blob = await response.blob();
  blobs.set(key, blob);
  return blob;
}
