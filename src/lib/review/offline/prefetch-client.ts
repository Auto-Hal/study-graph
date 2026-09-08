"use client";

import {
  assertValidOfflinePilotFeedbackBundle,
  assertValidServerIssuedOfflineInstance,
  type OfflinePilotFeedbackBundleV1,
  type ServerIssuedOfflineInstance,
} from "./model-core.ts";
import {
  cacheVerifiedOfflineAsset,
  isOfflineAssetRenderable,
  type OfflineAssetCacheOptions,
} from "./assets.ts";
import {
  persistPrefetchedOfflineInstance,
  prepareOfflinePrefetchRequest,
  type OfflineInstanceCacheOptions,
  type OfflineIssuedInstanceRecord,
} from "./instance-cache.ts";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PilotPrefetchClientOptions = OfflineInstanceCacheOptions & Pick<
  OfflineAssetCacheOptions,
  "cacheStorage" | "cryptoProvider" | "cacheName" | "sourceUrl"
> & Readonly<{
  fetchImpl?: FetchLike;
}>;

export class OfflinePrefetchClientError extends Error {
  readonly code:
    | "network"
    | "server"
    | "invalid-response"
    | "asset-not-ready"
    | "cache-failed";

  constructor(code: OfflinePrefetchClientError["code"], message: string = code) {
    super(message);
    this.name = "OfflinePrefetchClientError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The only browser-controlled values accepted by the prefetch endpoint. */
export function prefetchRequestBody(identity: { deviceId: string; issuanceRequestId: string }) {
  return {
    deviceId: identity.deviceId,
    issuanceRequestId: identity.issuanceRequestId,
  } as const;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Durably allocate/reuse the request identity before starting the network
 * request, then persist and verify every server-issued descriptor/asset.
 * There is intentionally no provisional or client-created instance path.
 */
export async function prefetchPilotOfflineInstance(
  options: PilotPrefetchClientOptions = {},
): Promise<OfflineIssuedInstanceRecord> {
  const identity = await prepareOfflinePrefetchRequest(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new OfflinePrefetchClientError("network", "fetch is unavailable");

  let response: Response;
  try {
    response = await fetchImpl("/api/review/pilot/prefetch", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefetchRequestBody(identity)),
      cache: "no-store",
    });
  } catch {
    // The pending request mapping remains durable and can be retried with the
    // same issuanceRequestId after connectivity returns.
    throw new OfflinePrefetchClientError("network", "prefetch request failed");
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw new OfflinePrefetchClientError(
      response.status >= 500 ? "server" : "invalid-response",
      typeof payload.error === "string" ? payload.error : "prefetch request was rejected",
    );
  }
  const descriptor = payload.descriptor;
  const feedback = payload.feedback;
  try {
    assertValidServerIssuedOfflineInstance(descriptor);
    assertValidOfflinePilotFeedbackBundle(feedback);
  } catch {
    throw new OfflinePrefetchClientError("invalid-response", "server-issued prefetch descriptor is invalid");
  }
  if (descriptor.assets.length === 0) {
    throw new OfflinePrefetchClientError("asset-not-ready", "prefetch descriptor has no assets");
  }

  const record = await persistPrefetchedOfflineInstance({
    request: identity,
    descriptor: descriptor as ServerIssuedOfflineInstance,
    feedback: feedback as OfflinePilotFeedbackBundleV1,
  }, options);

  for (const asset of record.descriptor.assets) {
    const cached = await cacheVerifiedOfflineAsset(asset, options);
    if (cached.kind !== "ready") {
      throw new OfflinePrefetchClientError("asset-not-ready", cached.reason);
    }
    if (!(await isOfflineAssetRenderable(asset, options))) {
      throw new OfflinePrefetchClientError("cache-failed", "verified asset bytes are unavailable");
    }
  }
  return record;
}
