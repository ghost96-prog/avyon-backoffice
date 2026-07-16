// service-worker.js
const CACHE_NAME = "cache-v1";
const OFFLINE_URL = "/index.html"; // must already be cached (see below) or served by network on first load

self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET — let everything else (POST/PUT/etc.) go straight to network untouched.
  if (request.method !== "GET") {
    return; // don't call respondWith at all; browser handles it natively
  }

  // Only handle http/https. chrome-extension:, data:, blob:, etc. must be left alone —
  // Cache API throws on put() for these schemes.
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // SPA navigations (e.g. /reports/top-selling-items): these are client-side routes,
  // not real server paths, so on network failure fall back to the cached index.html
  // instead of trying to cache-match the exact route path (which will never exist).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(OFFLINE_URL);
        return (
          cached ||
          new Response("Offline", { status: 503, statusText: "Service Unavailable" })
        );
      })
    );
    return;
  }

  // Regular assets: network-first, fall back to cache, then a real fallback Response —
  // every branch here resolves to an actual Response, never undefined.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {
          // ignore cache write failures (e.g. opaque cross-origin responses)
        });
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        return (
          cached ||
          new Response("Offline", { status: 503, statusText: "Service Unavailable" })
        );
      }
    })()
  );
});