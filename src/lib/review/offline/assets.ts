import {
  assertValidOfflineAssetDescriptor,
  createOfflineAssetDescriptor,
  type OfflineAssetDescriptor,
} from "./model-core.ts";
import {
  getStoredOfflineAssetDescriptor,
  markOfflineAssetReady,
  type OfflineInstanceCacheOptions,
} from "./instance-cache.ts";

export const OFFLINE_ASSET_CACHE_NAME = "study-graph-offline-assets-v1" as const;

type CacheLike = {
  match(request: RequestInfo | URL): Promise<Response | undefined | null>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
};

type CacheStorageLike = {
  open(cacheName: string): Promise<CacheLike>;
};

export type OfflineAssetCacheOptions = OfflineInstanceCacheOptions & Readonly<{
  fetchImpl?: typeof fetch;
  cacheStorage?: CacheStorageLike;
  cryptoProvider?: Pick<Crypto, "subtle">;
  cacheName?: string;
  sourceUrl?: string;
}>;

export type OfflineAssetCacheResult =
  | { kind: "ready"; descriptor: OfflineAssetDescriptor; cacheKey: string }
  | { kind: "not-ready"; reason: "checksum-missing" | "checksum-mismatch" | "fetch-failed" | "cache-unavailable" };

function cacheStorage(options: OfflineAssetCacheOptions): CacheStorageLike | null {
  return options.cacheStorage ?? (globalThis.caches as unknown as CacheStorageLike | undefined) ?? null;
}

function cryptoProvider(options: OfflineAssetCacheOptions) {
  return options.cryptoProvider ?? globalThis.crypto;
}

function cacheKey(asset: OfflineAssetDescriptor, sourceUrl?: string) {
  if (!asset.checksum) throw new Error("asset checksum is required for offline caching");
  const source = sourceUrl ?? asset.src;
  if (!source) throw new Error("asset source URL is required for offline caching");
  // A query parameter keeps the checksum in the Cache Storage key while
  // remaining a valid request URL for both relative and absolute sources.
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}offline_sha256=${asset.checksum}`;
}

async function sha256(bytes: ArrayBuffer, options: OfflineAssetCacheOptions) {
  const provider = cryptoProvider(options);
  if (!provider?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const digest = await provider.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Fetch, verify, and cache immutable bytes before marking local readiness. */
export async function cacheVerifiedOfflineAsset(
  asset: OfflineAssetDescriptor,
  options: OfflineAssetCacheOptions = {},
): Promise<OfflineAssetCacheResult> {
  try {
    assertValidOfflineAssetDescriptor(asset);
  } catch {
    return { kind: "not-ready", reason: "checksum-mismatch" };
  }
  if (!asset.checksum || !/^[0-9a-f]{64}$/.test(asset.checksum)) {
    return { kind: "not-ready", reason: "checksum-missing" };
  }
  const storage = cacheStorage(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!storage || !fetchImpl) return { kind: "not-ready", reason: "cache-unavailable" };
  let key: string;
  try {
    key = cacheKey(asset, options.sourceUrl);
    const response = await fetchImpl(options.sourceUrl ?? asset.src ?? "", { cache: "no-store" });
    if (!response.ok) return { kind: "not-ready", reason: "fetch-failed" };
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes, options) !== asset.checksum) return { kind: "not-ready", reason: "checksum-mismatch" };
    const cache = await storage.open(options.cacheName ?? OFFLINE_ASSET_CACHE_NAME);
    await cache.put(key, new Response(bytes, { headers: { "Content-Type": asset.mediaType } }));
    // The descriptor is marked ready only after Cache.put resolves and the
    // independent IndexedDB transaction completes.
    const ready = await markOfflineAssetReady(asset, options);
    return { kind: "ready", descriptor: ready, cacheKey: key };
  } catch {
    return { kind: "not-ready", reason: "cache-unavailable" };
  }
}

/** Verify that bytes are still present and match the pinned checksum. */
export async function hasVerifiedOfflineAsset(
  asset: OfflineAssetDescriptor,
  options: OfflineAssetCacheOptions = {},
) {
  try {
    assertValidOfflineAssetDescriptor(asset);
    if (!asset.checksum) return false;
    const storage = cacheStorage(options);
    if (!storage) return false;
    const response = await (await storage.open(options.cacheName ?? OFFLINE_ASSET_CACHE_NAME)).match(cacheKey(asset, options.sourceUrl));
    if (!response) return false;
    const bytes = await response.arrayBuffer();
    return (await sha256(bytes, options)) === asset.checksum;
  } catch {
    return false;
  }
}

/**
 * Read verified bytes for an already cached asset.  Returning bytes only
 * after rechecking the checksum prevents a stale or tampered Cache Storage
 * entry from becoming a renderable offline card.
 */
export async function readVerifiedOfflineAssetBytes(
  asset: OfflineAssetDescriptor,
  options: OfflineAssetCacheOptions = {},
): Promise<ArrayBuffer | null> {
  try {
    assertValidOfflineAssetDescriptor(asset);
    if (!asset.checksum) return null;
    const storage = cacheStorage(options);
    if (!storage) return null;
    const response = await (await storage.open(options.cacheName ?? OFFLINE_ASSET_CACHE_NAME)).match(cacheKey(asset, options.sourceUrl));
    if (!response) return null;
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes, options) !== asset.checksum) return null;
    return bytes;
  } catch {
    return null;
  }
}

/** A descriptor is only renderable offline when both IDB readiness and bytes exist. */
export async function isOfflineAssetRenderable(
  asset: OfflineAssetDescriptor,
  options: OfflineAssetCacheOptions = {},
) {
  const stored = await getStoredOfflineAssetDescriptor(asset, options);
  return Boolean(stored?.offlineReady) && await hasVerifiedOfflineAsset(asset, options);
}

export function offlineAssetCacheKey(asset: OfflineAssetDescriptor, sourceUrl?: string) {
  return cacheKey(asset, sourceUrl);
}

/** Build the local descriptor received from a server-issued revision. */
export function createOfflineAssetDescriptorForSource(input: Parameters<typeof createOfflineAssetDescriptor>[0] & { src: string }) {
  return createOfflineAssetDescriptor(input);
}
