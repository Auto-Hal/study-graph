/* Study Graph Phase 4E-6: cache/transport helper only. No API writes. */
const SHELL_CACHE = "study-graph-app-shell-v1";
const SHELL_CACHE_PREFIX = "study-graph-app-shell-";
const OFFLINE_SHELL_PATH = "/offline-review";

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function cacheableResponse(response) {
  return response && response.ok && !response.headers.has("set-cookie");
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    // Deliberately preserve study-graph-offline-assets-v1, snapshots, outbox, instances, and
    // receipts. They belong to other stores/namespaces and are never cleanup
    // targets of this worker.
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  // APIs, login, and authenticated responses are network-only. In
  // particular, the worker never sends or caches an attempt POST.
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request) || await cache.match(OFFLINE_SHELL_PATH);
        return cached || new Response("Offline review shell is not prepared.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  // Next hashed static files are immutable by URL and can be cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (cacheableResponse(response)) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  // The warmed manifest and existing icon are shell dependencies too. Keep
  // their cache behavior scoped to the owned shell namespace; other public
  // resources remain network-only unless they are immutable Next chunks.
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.svg") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (cacheableResponse(response)) await cache.put(request, response.clone());
      return response;
    })());
  }
});
