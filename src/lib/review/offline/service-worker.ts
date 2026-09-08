"use client";

/**
 * The service worker is a transport/cache helper only. It never becomes an
 * authority for Scope, instances, attempts, receipts, or SRS state.
 */
export const OFFLINE_SERVICE_WORKER_PATH = "/study-graph-sw.js" as const;
export const OFFLINE_SHELL_PATH = "/offline-review" as const;
export const OFFLINE_APP_SHELL_CACHE_NAME = "study-graph-app-shell-v1" as const;
export const OFFLINE_APP_SHELL_CACHE_PREFIX = "study-graph-app-shell-" as const;

export type OfflineShellRegistrationOptions = Readonly<{
  serviceWorker?: ServiceWorkerContainer;
  caches?: CacheStorage;
}>;

export type OfflineShellWarmOptions = OfflineShellRegistrationOptions & Readonly<{
  fetchImpl?: typeof fetch;
  cacheName?: string;
}>;

/** Emergency switch. Only the app-shell registration/cache is affected. */
export function isOfflineShellEnabled() {
  return process.env.NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED !== "false";
}

function canRegisterServiceWorker(serviceWorker: ServiceWorkerContainer | undefined) {
  if (!serviceWorker || typeof window === "undefined" || typeof location === "undefined") return false;
  return location.protocol === "https:"
    || location.hostname === "localhost"
    || location.hostname === "127.0.0.1"
    || location.hostname === "[::1]";
}

/** Remove only Study Graph app-shell registrations/caches when disabled. */
export async function disableOfflineShell(options: OfflineShellRegistrationOptions = {}) {
  const serviceWorker = options.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (serviceWorker) {
    try {
      const registrations = await serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((registration) => {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          return registration.scope.endsWith("/") && worker?.scriptURL.endsWith(OFFLINE_SERVICE_WORKER_PATH);
        })
        .map((registration) => registration.unregister()));
    } catch {
      // Disabling the enhancement must never break the regular app.
    }
  }
  const storage = options.caches ?? globalThis.caches;
  if (storage) {
    try {
      const names = await storage.keys();
      await Promise.all(names
        .filter((name) => name.startsWith(OFFLINE_APP_SHELL_CACHE_PREFIX))
        .map((name) => storage.delete(name)));
    } catch {
      // Cache cleanup is best-effort. Offline asset/IDB stores are untouched.
    }
  }
}

/** Register the minimal worker on HTTPS (and localhost during development). */
export async function registerOfflineServiceWorker(
  options: OfflineShellRegistrationOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (!isOfflineShellEnabled()) {
    await disableOfflineShell(options);
    return null;
  }
  const serviceWorker = options.serviceWorker ?? globalThis.navigator?.serviceWorker;
  if (!canRegisterServiceWorker(serviceWorker)) return null;
  try {
    return await serviceWorker!.register(OFFLINE_SERVICE_WORKER_PATH, { scope: "/" });
  } catch {
    return null;
  }
}

function sameOriginPath(value: string): string | null {
  try {
    const url = new URL(value, globalThis.location?.origin ?? "https://study-graph.invalid");
    if (url.origin !== (globalThis.location?.origin ?? url.origin)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function cacheableShellResponse(response: Response) {
  return response.ok && !response.headers.has("set-cookie");
}

/** Extract only static same-origin dependencies from the prepared shell HTML. */
export function extractOfflineShellDependencyUrls(html: string): string[] {
  const urls = new Set<string>(["/manifest.webmanifest", "/icon.svg", OFFLINE_SERVICE_WORKER_PATH]);
  const pattern = /(?:src|href)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    const path = value ? sameOriginPath(value) : null;
    if (!path) continue;
    if (path.startsWith("/_next/static/") || path === "/icon.svg" || path === "/manifest.webmanifest") urls.add(path);
  }
  return [...urls].sort();
}

/**
 * Warm the dedicated shell after a user explicitly prepares an offline card.
 * The shell is considered ready only after its HTML and static dependencies
 * have been fetched and committed to the owned Cache Storage namespace.
 */
export async function warmOfflineReviewShell(
  options: OfflineShellWarmOptions = {},
): Promise<boolean> {
  if (!isOfflineShellEnabled()) return false;
  const registration = await registerOfflineServiceWorker(options);
  if (!registration) return false;
  const storage = options.caches ?? globalThis.caches;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!storage || !fetchImpl) return false;
  try {
    const cache = await storage.open(options.cacheName ?? OFFLINE_APP_SHELL_CACHE_NAME);
    const shellResponse = await fetchImpl(OFFLINE_SHELL_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (!cacheableShellResponse(shellResponse)) return false;
    const shellHtml = await shellResponse.clone().text();
    await cache.put(OFFLINE_SHELL_PATH, shellResponse.clone());
    for (const url of extractOfflineShellDependencyUrls(shellHtml)) {
      const response = await fetchImpl(url, { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (!cacheableShellResponse(response)) return false;
      await cache.put(url, response.clone());
    }
    return true;
  } catch {
    // Existing issued instances/assets remain intact when shell warming fails.
    return false;
  }
}
