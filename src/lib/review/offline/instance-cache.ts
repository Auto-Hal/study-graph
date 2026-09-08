import {
  assertValidOfflineAssetDescriptor,
  assertValidOfflinePilotFeedbackBundle,
  assertValidServerIssuedOfflineInstance,
  canonicalizeJson,
  deepFreeze,
  type OfflineAssetDescriptor,
  type OfflinePilotFeedbackBundleV1,
  type ServerIssuedOfflineInstance,
} from "./model-core.ts";

/** The issued-instance replica is deliberately separate from snapshot/outbox DBs. */
export const OFFLINE_INSTANCE_CACHE_DB_NAME = "study-graph-offline-instance-cache" as const;
export const OFFLINE_INSTANCE_CACHE_DB_VERSION = 1 as const;
export const OFFLINE_DEVICE_META_STORE = "device_meta" as const;
export const OFFLINE_ISSUANCE_REQUESTS_STORE = "issuance_requests" as const;
export const OFFLINE_ISSUED_INSTANCES_STORE = "issued_instances" as const;
export const OFFLINE_ASSET_DESCRIPTORS_STORE = "asset_descriptors" as const;

const DEVICE_META_KEY = "device";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfflineInstanceLocalState = "ready" | "answered";

export type OfflineIssuanceRequestRecord = Readonly<{
  requestId: string;
  deviceId: string;
  state: "pending" | "fulfilled";
  instanceId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type OfflineIssuedInstanceRecord = Readonly<{
  instanceId: string;
  requestId: string;
  deviceId: string;
  descriptor: ServerIssuedOfflineInstance;
  feedback: OfflinePilotFeedbackBundleV1;
  state: OfflineInstanceLocalState;
  createdAt: string;
  updatedAt: string;
  answeredAt?: string;
  answeredAttemptId?: string;
}>;

type DeviceMeta = Readonly<{
  key: typeof DEVICE_META_KEY;
  deviceId: string;
  activeRequestId?: string;
}>;

type StoredAssetDescriptor = Readonly<{
  assetKey: string;
  descriptor: OfflineAssetDescriptor;
  verifiedAt: string | null;
}>;

export type OfflineInstanceCacheOptions = Readonly<{
  indexedDB?: IDBFactory;
  dbName?: string;
  now?: () => string;
  randomUUID?: () => string;
}>;

export type PrefetchRequestIdentity = Readonly<{
  deviceId: string;
  issuanceRequestId: string;
}>;

export class OfflineInstanceCacheError extends Error {
  readonly code:
    | "instance_cache_unavailable"
    | "instance_cache_storage_failed"
    | "instance_cache_conflict"
    | "invalid_instance_descriptor"
    | "invalid_request_identity";

  constructor(code: OfflineInstanceCacheError["code"], message: string = code) {
    super(message);
    this.name = "OfflineInstanceCacheError";
    this.code = code;
  }
}

function indexedDbFactory(options: OfflineInstanceCacheOptions): IDBFactory {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new OfflineInstanceCacheError("instance_cache_unavailable", "IndexedDB is unavailable");
  return factory;
}

function clock(options: OfflineInstanceCacheOptions) {
  return options.now ?? (() => new Date().toISOString());
}

function uuid(options: OfflineInstanceCacheOptions) {
  const value = (options.randomUUID ?? (() => globalThis.crypto?.randomUUID?.() ?? ""))();
  if (!UUID_PATTERN.test(value)) throw new OfflineInstanceCacheError("invalid_request_identity", "A UUID is required");
  return value;
}

function openInstanceCache(options: OfflineInstanceCacheOptions): Promise<IDBDatabase> {
  const request = indexedDbFactory(options).open(
    options.dbName ?? OFFLINE_INSTANCE_CACHE_DB_NAME,
    OFFLINE_INSTANCE_CACHE_DB_VERSION,
  );
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_DEVICE_META_STORE)) {
        database.createObjectStore(OFFLINE_DEVICE_META_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_ISSUANCE_REQUESTS_STORE)) {
        const store = database.createObjectStore(OFFLINE_ISSUANCE_REQUESTS_STORE, { keyPath: "requestId" });
        store.createIndex("by_device", "deviceId", { unique: false });
      }
      if (!database.objectStoreNames.contains(OFFLINE_ISSUED_INSTANCES_STORE)) {
        const store = database.createObjectStore(OFFLINE_ISSUED_INSTANCES_STORE, { keyPath: "instanceId" });
        store.createIndex("by_request", "requestId", { unique: true });
        store.createIndex("by_device_state", ["deviceId", "state"], { unique: false });
      }
      if (!database.objectStoreNames.contains(OFFLINE_ASSET_DESCRIPTORS_STORE)) {
        database.createObjectStore(OFFLINE_ASSET_DESCRIPTORS_STORE, { keyPath: "assetKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflineInstanceCacheError("instance_cache_storage_failed", "IndexedDB open failed"));
    request.onblocked = () => reject(new OfflineInstanceCacheError("instance_cache_storage_failed", "IndexedDB upgrade is blocked"));
  });
}

/**
 * Delivery metadata describes this local delivery attempt, rather than the
 * immutable instance issued by the server.  In particular, a lost response
 * can be replayed with a new prefetchedAt value, so it must not turn an
 * otherwise idempotent response into a local descriptor conflict.
 */
function descriptorIdentity(value: ServerIssuedOfflineInstance) {
  const { delivery: _delivery, ...identity } = value;
  return identity;
}

function sameDescriptor(left: ServerIssuedOfflineInstance, right: ServerIssuedOfflineInstance) {
  return canonicalizeJson(descriptorIdentity(left)) === canonicalizeJson(descriptorIdentity(right));
}

/**
 * Asset readiness is local delivery metadata, not part of the immutable
 * server-issued asset identity.  A descriptor received again after a
 * successful Cache Storage verification therefore compares equal even when
 * the stored copy has transitioned from offlineReady=false to true.
 */
function assetIdentity(value: OfflineAssetDescriptor) {
  const { offlineReady: _offlineReady, ...identity } = value;
  return identity;
}

function sameAssetDescriptor(left: OfflineAssetDescriptor, right: OfflineAssetDescriptor) {
  return canonicalizeJson(assetIdentity(left)) === canonicalizeJson(assetIdentity(right));
}

function assertRequestIdentity(value: PrefetchRequestIdentity) {
  if (!UUID_PATTERN.test(value.deviceId) || !UUID_PATTERN.test(value.issuanceRequestId)) {
    throw new OfflineInstanceCacheError("invalid_request_identity", "deviceId and issuanceRequestId must be UUIDs");
  }
}

/**
 * Durably create/reuse the device and issuance request identity. Call this
 * before any prefetch network request; a pending request survives reloads.
 */
export async function prepareOfflinePrefetchRequest(
  options: OfflineInstanceCacheOptions = {},
): Promise<PrefetchRequestIdentity> {
  const database = await openInstanceCache(options);
  try {
    return await new Promise<PrefetchRequestIdentity>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_DEVICE_META_STORE, OFFLINE_ISSUANCE_REQUESTS_STORE], "readwrite");
      const metaStore = transaction.objectStore(OFFLINE_DEVICE_META_STORE);
      const requestsStore = transaction.objectStore(OFFLINE_ISSUANCE_REQUESTS_STORE);
      let result: PrefetchRequestIdentity | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => result ? resolve(result) : reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onerror = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onabort = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));

      const metaRequest = metaStore.get(DEVICE_META_KEY);
      metaRequest.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
      metaRequest.onsuccess = () => {
        const existingMeta = metaRequest.result as DeviceMeta | undefined;
        const deviceId = existingMeta?.deviceId && UUID_PATTERN.test(existingMeta.deviceId)
          ? existingMeta.deviceId
          : uuid(options);
        const activeRequestId = existingMeta?.activeRequestId;
        if (activeRequestId && UUID_PATTERN.test(activeRequestId)) {
          const existingRequest = requestsStore.get(activeRequestId);
          existingRequest.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
          existingRequest.onsuccess = () => {
            const request = existingRequest.result as OfflineIssuanceRequestRecord | undefined;
            if (request?.deviceId === deviceId && request.state === "pending") {
              result = { deviceId, issuanceRequestId: request.requestId };
              return;
            }
            createRequest(deviceId, existingMeta?.activeRequestId);
          };
          return;
        }
        createRequest(deviceId);

        function createRequest(stableDeviceId: string, _previousRequestId?: string) {
          const issuanceRequestId = uuid(options);
          const now = clock(options)();
          requestsStore.put(deepFreeze({
            requestId: issuanceRequestId,
            deviceId: stableDeviceId,
            state: "pending",
            instanceId: null,
            createdAt: now,
            updatedAt: now,
          } satisfies OfflineIssuanceRequestRecord));
          metaStore.put(deepFreeze({ key: DEVICE_META_KEY, deviceId: stableDeviceId, activeRequestId: issuanceRequestId } satisfies DeviceMeta));
          result = { deviceId: stableDeviceId, issuanceRequestId };
        }
      };
    });
  } finally {
    database.close();
  }
}

/** Return the stable device ID without creating a network request. */
export async function getOfflineDeviceId(options: OfflineInstanceCacheOptions = {}) {
  return (await prepareOfflinePrefetchRequest(options)).deviceId;
}

export function offlineAssetDescriptorKey(asset: Pick<OfflineAssetDescriptor, "assetId" | "assetVersion" | "checksum">) {
  return `${asset.assetId}@${asset.assetVersion}:${asset.checksum ?? "unknown"}`;
}

/**
 * Store the server response and the fulfilled request mapping. The descriptor
 * and feedback are validated before the transaction; no client-created
 * instance can enter this cache.
 */
export async function persistPrefetchedOfflineInstance(input: {
  request: PrefetchRequestIdentity;
  descriptor: ServerIssuedOfflineInstance;
  feedback: OfflinePilotFeedbackBundleV1;
}, options: OfflineInstanceCacheOptions = {}): Promise<OfflineIssuedInstanceRecord> {
  assertRequestIdentity(input.request);
  try {
    assertValidServerIssuedOfflineInstance(input.descriptor);
    assertValidOfflinePilotFeedbackBundle(input.feedback);
  } catch (error) {
    throw new OfflineInstanceCacheError("invalid_instance_descriptor", error instanceof Error ? error.message : "invalid instance descriptor");
  }
  if (input.descriptor.delivery?.deviceId && input.descriptor.delivery.deviceId !== input.request.deviceId) {
    throw new OfflineInstanceCacheError("instance_cache_conflict", "server descriptor belongs to another device");
  }
  if (input.feedback.revisionContentHash !== input.descriptor.revision.revisionContentHash) {
    throw new OfflineInstanceCacheError("instance_cache_conflict", "feedback is pinned to another revision");
  }
  const database = await openInstanceCache(options);
  try {
    return await new Promise<OfflineIssuedInstanceRecord>((resolve, reject) => {
      const transaction = database.transaction([
        OFFLINE_ISSUANCE_REQUESTS_STORE,
        OFFLINE_ISSUED_INSTANCES_STORE,
        OFFLINE_ASSET_DESCRIPTORS_STORE,
      ], "readwrite");
      const requests = transaction.objectStore(OFFLINE_ISSUANCE_REQUESTS_STORE);
      const instances = transaction.objectStore(OFFLINE_ISSUED_INSTANCES_STORE);
      const assets = transaction.objectStore(OFFLINE_ASSET_DESCRIPTORS_STORE);
      let result: OfflineIssuedInstanceRecord | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => result ? resolve(result) : reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onerror = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onabort = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));

      const requestLookup = requests.get(input.request.issuanceRequestId);
      requestLookup.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
      requestLookup.onsuccess = () => {
        const existingRequest = requestLookup.result as OfflineIssuanceRequestRecord | undefined;
        if (existingRequest && existingRequest.deviceId !== input.request.deviceId) {
          operationError = new OfflineInstanceCacheError("instance_cache_conflict", "issuance request ownership conflict");
          transaction.abort();
          return;
        }
        const instanceLookup = instances.get(input.descriptor.instanceId);
        instanceLookup.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
        instanceLookup.onsuccess = () => {
          const existingInstance = instanceLookup.result as OfflineIssuedInstanceRecord | undefined;
          if (existingInstance && (
            !sameDescriptor(existingInstance.descriptor, input.descriptor)
            || canonicalizeJson(existingInstance.feedback) !== canonicalizeJson(input.feedback)
            || existingInstance.deviceId !== input.request.deviceId
          )) {
            operationError = new OfflineInstanceCacheError("instance_cache_conflict", "instance descriptor conflict");
            transaction.abort();
            return;
          }
          if (existingRequest?.state === "fulfilled" && existingRequest.instanceId !== input.descriptor.instanceId) {
            operationError = new OfflineInstanceCacheError("instance_cache_conflict", "issuance request already maps to another instance");
            transaction.abort();
            return;
          }
          const now = clock(options)();
          const record = existingInstance ?? deepFreeze({
            instanceId: input.descriptor.instanceId,
            requestId: input.request.issuanceRequestId,
            deviceId: input.request.deviceId,
            descriptor: input.descriptor,
            feedback: input.feedback,
            state: "ready" as const,
            createdAt: now,
            updatedAt: now,
          });
          if (existingInstance && !sameDescriptor(existingInstance.descriptor, input.descriptor)) {
            operationError = new OfflineInstanceCacheError("instance_cache_conflict", "immutable instance changed");
            transaction.abort();
            return;
          }
          instances.put(record);
          requests.put(deepFreeze({
            requestId: input.request.issuanceRequestId,
            deviceId: input.request.deviceId,
            state: "fulfilled",
            instanceId: input.descriptor.instanceId,
            createdAt: existingRequest?.createdAt ?? now,
            updatedAt: now,
          } satisfies OfflineIssuanceRequestRecord));
          for (const asset of input.descriptor.assets) {
            assertValidOfflineAssetDescriptor(asset);
            const assetKey = offlineAssetDescriptorKey(asset);
            const existingAsset = assets.get(assetKey);
            existingAsset.onsuccess = () => {
              const stored = existingAsset.result as StoredAssetDescriptor | undefined;
              if (stored && !sameAssetDescriptor(stored.descriptor, asset)) {
                operationError = new OfflineInstanceCacheError("instance_cache_conflict", "asset descriptor conflict");
                transaction.abort();
                return;
              }
              if (!stored) assets.put(deepFreeze({ assetKey, descriptor: asset, verifiedAt: null } satisfies StoredAssetDescriptor));
            };
            existingAsset.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
          }
          result = record;
        };
      };
    });
  } catch (error) {
    if (error instanceof OfflineInstanceCacheError) throw error;
    throw new OfflineInstanceCacheError("instance_cache_storage_failed", error instanceof Error ? error.message : "IndexedDB write failed");
  } finally {
    database.close();
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
  });
}

export async function getOfflineIssuedInstance(
  instanceId: string,
  options: OfflineInstanceCacheOptions = {},
): Promise<OfflineIssuedInstanceRecord | null> {
  const database = await openInstanceCache(options);
  try {
    const transaction = database.transaction(OFFLINE_ISSUED_INSTANCES_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(OFFLINE_ISSUED_INSTANCES_STORE).get(instanceId));
    return value ? deepFreeze(value as OfflineIssuedInstanceRecord) : null;
  } finally {
    database.close();
  }
}

export async function listOfflineIssuedInstances(options: OfflineInstanceCacheOptions = {}) {
  const database = await openInstanceCache(options);
  try {
    const transaction = database.transaction(OFFLINE_ISSUED_INSTANCES_STORE, "readonly");
    const values = await requestResult(transaction.objectStore(OFFLINE_ISSUED_INSTANCES_STORE).getAll());
    return (values as OfflineIssuedInstanceRecord[]).map((value) => deepFreeze(value));
  } finally {
    database.close();
  }
}

export async function listReadyOfflineIssuedInstances(options: OfflineInstanceCacheOptions = {}) {
  const values = await listOfflineIssuedInstances(options);
  return values.filter((value) => value.state === "ready");
}

/** Mark answered only after the attempt outbox transaction has completed. */
export async function markOfflineInstanceAnswered(
  instanceId: string,
  attemptId: string,
  options: OfflineInstanceCacheOptions = {},
): Promise<OfflineIssuedInstanceRecord | null> {
  if (!UUID_PATTERN.test(attemptId)) throw new OfflineInstanceCacheError("invalid_request_identity", "attemptId must be a UUID");
  const database = await openInstanceCache(options);
  try {
    return await new Promise<OfflineIssuedInstanceRecord | null>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_ISSUED_INSTANCES_STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_ISSUED_INSTANCES_STORE);
      let result: OfflineIssuedInstanceRecord | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onabort = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      const lookup = store.get(instanceId);
      lookup.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
      lookup.onsuccess = () => {
        const current = lookup.result as OfflineIssuedInstanceRecord | undefined;
        if (!current) return;
        if (current.state === "answered") {
          if (current.answeredAttemptId && current.answeredAttemptId !== attemptId) {
            operationError = new OfflineInstanceCacheError("instance_cache_conflict", "instance already answered by another attempt");
            transaction.abort();
            return;
          }
          result = deepFreeze(current);
          return;
        }
        const updated = deepFreeze({
          ...current,
          state: "answered" as const,
          answeredAt: clock(options)(),
          answeredAttemptId: attemptId,
          updatedAt: clock(options)(),
        });
        store.put(updated);
        result = updated;
      };
    });
  } finally {
    database.close();
  }
}

/** Persist local readiness only after Cache Storage bytes were verified. */
export async function markOfflineAssetReady(
  asset: OfflineAssetDescriptor,
  options: OfflineInstanceCacheOptions = {},
): Promise<OfflineAssetDescriptor> {
  assertValidOfflineAssetDescriptor(asset);
  if (!asset.checksum || !/^[0-9a-f]{64}$/.test(asset.checksum)) {
    throw new OfflineInstanceCacheError("invalid_instance_descriptor", "an asset checksum is required");
  }
  const database = await openInstanceCache(options);
  try {
    const key = offlineAssetDescriptorKey(asset);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_ASSET_DESCRIPTORS_STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_ASSET_DESCRIPTORS_STORE);
      let operationError: Error | null = null;
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      transaction.onabort = () => reject(operationError ?? new OfflineInstanceCacheError("instance_cache_storage_failed"));
      const lookup = store.get(key);
      lookup.onerror = () => { operationError = new OfflineInstanceCacheError("instance_cache_storage_failed"); transaction.abort(); };
      lookup.onsuccess = () => {
        const stored = lookup.result as StoredAssetDescriptor | undefined;
        if (stored && !sameAssetDescriptor(stored.descriptor, asset)) {
          operationError = new OfflineInstanceCacheError("instance_cache_conflict", "asset descriptor conflict");
          transaction.abort();
          return;
        }
        store.put(deepFreeze({ assetKey: key, descriptor: { ...asset, offlineReady: true }, verifiedAt: clock(options)() } satisfies StoredAssetDescriptor));
      };
    });
    return deepFreeze({ ...asset, offlineReady: true });
  } finally {
    database.close();
  }
}

export async function getStoredOfflineAssetDescriptor(
  asset: Pick<OfflineAssetDescriptor, "assetId" | "assetVersion" | "checksum">,
  options: OfflineInstanceCacheOptions = {},
): Promise<OfflineAssetDescriptor | null> {
  const database = await openInstanceCache(options);
  try {
    const transaction = database.transaction(OFFLINE_ASSET_DESCRIPTORS_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(OFFLINE_ASSET_DESCRIPTORS_STORE).get(offlineAssetDescriptorKey(asset)));
    const stored = value as StoredAssetDescriptor | undefined;
    return stored ? deepFreeze(stored.descriptor) : null;
  } finally {
    database.close();
  }
}

export async function isOfflineIssuedInstanceReady(
  record: OfflineIssuedInstanceRecord,
  options: OfflineInstanceCacheOptions = {},
) {
  if (record.state !== "ready") return false;
  for (const asset of record.descriptor.assets) {
    const stored = await getStoredOfflineAssetDescriptor(asset, options);
    if (!stored?.offlineReady) return false;
  }
  return true;
}
