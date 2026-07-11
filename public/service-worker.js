// service-worker.js
self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
  // Skip waiting to activate immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  // Claim clients to take control immediately
  event.waitUntil(self.clients.claim());
});

// IMPORTANT: Only add fetch handler if you actually need it
// Option 1: Remove the fetch handler entirely if you don't need it
// Option 2: Add proper fetch handling

// Option 1: No fetch handler (recommended if you don't need caching)
// Just remove the fetch event listener completely

// Option 2: Proper fetch handler (if you need caching)
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response to cache it
        const responseClone = response.clone();
        caches.open("cache-v1").then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
      .catch(() => {
        // If all fails, return a basic offline response
        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
        });
      })
  );
});