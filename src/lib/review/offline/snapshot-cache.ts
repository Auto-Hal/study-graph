import {
  assertValidScopeKnowledgeSnapshot,
  compareVerifiedSnapshotAdoption,
  type ScopeKnowledgeSnapshot,
} from "./snapshot-content.ts";
import {
  isScopeKnowledgeSnapshotHashValidBrowser,
  type BrowserCryptoProvider,
} from "./snapshot-browser.ts";

export const SNAPSHOT_CACHE_DB_NAME = "study-graph-snapshot-cache" as const;
export const SNAPSHOT_CACHE_DB_VERSION = 1 as const;
export const SNAPSHOT_STORE_NAME = "snapshots" as const;
export const SNAPSHOT_META_STORE_NAME = "snapshot_meta" as const;

export type SnapshotCacheMeta = Readonly<{
  projectId: string;
  currentSnapshotId: string;
  generation: number;
  contentHash: string;
}>;

export type SnapshotCacheAdoption =
  | { kind: "adopted"; reason: "no-current" | "newer-generation" }
  | { kind: "ignored"; reason: "older-generation" | "same-generation" }
  | { kind: "conflict"; reason: "same-generation-different-hash" | "snapshot-id-different-hash" | "snapshot-id-different-generation" }
  | { kind: "rejected"; reason: "invalid-candidate" | "invalid-current" };

export type SnapshotCacheOptions = Readonly<{
  indexedDB?: IDBFactory;
  cryptoProvider?: BrowserCryptoProvider;
  dbName?: string;
}>;

function indexedDbFactory(options: SnapshotCacheOptions): IDBFactory {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is unavailable");
  return factory;
}

function openSnapshotCache(options: SnapshotCacheOptions): Promise<IDBDatabase> {
  const request = indexedDbFactory(options).open(
    options.dbName ?? SNAPSHOT_CACHE_DB_NAME,
    SNAPSHOT_CACHE_DB_VERSION,
  );
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        database.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: "snapshotId" });
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_META_STORE_NAME)) {
        database.createObjectStore(SNAPSHOT_META_STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
  });
}

/**
 * Compare a candidate with the current pointer. The caller must have already
 * verified both hashes; generation is the only ordering authority.
 */
export function decideSnapshotCacheAdoption(
  current: ScopeKnowledgeSnapshot | null,
  candidate: ScopeKnowledgeSnapshot,
): SnapshotCacheAdoption {
  if (current !== null) {
    try {
      assertValidScopeKnowledgeSnapshot(current);
    } catch {
      return { kind: "rejected", reason: "invalid-current" };
    }
  }
  try {
    assertValidScopeKnowledgeSnapshot(candidate);
  } catch {
    return { kind: "rejected", reason: "invalid-candidate" };
  }
  const decision = compareVerifiedSnapshotAdoption(current, candidate);
  if (decision.kind === "adopt") return { kind: "adopted", reason: decision.reason };
  if (decision.reason === "same-generation-conflict") {
    return { kind: "conflict", reason: "same-generation-different-hash" };
  }
  if (decision.reason === "older-generation" || decision.reason === "same-generation") {
    return { kind: "ignored", reason: decision.reason };
  }
  return { kind: "rejected", reason: "invalid-candidate" };
}

function readCurrentInTransaction(
  transaction: IDBTransaction,
  projectId: string,
  onResult: (current: ScopeKnowledgeSnapshot | null, error?: Error) => void,
) {
  const metaRequest = transaction.objectStore(SNAPSHOT_META_STORE_NAME).get(projectId);
  metaRequest.onerror = () => onResult(null, new Error("IndexedDB metadata read failed"));
  metaRequest.onsuccess = () => {
    const meta = metaRequest.result as SnapshotCacheMeta | undefined;
    if (!meta?.currentSnapshotId) {
      onResult(null);
      return;
    }
    const snapshotRequest = transaction.objectStore(SNAPSHOT_STORE_NAME).get(meta.currentSnapshotId);
    snapshotRequest.onerror = () => onResult(null, new Error("IndexedDB current snapshot read failed"));
    snapshotRequest.onsuccess = () => {
      const current = snapshotRequest.result as ScopeKnowledgeSnapshot | undefined;
      if (!current) {
        onResult(null, new Error("IndexedDB current snapshot is missing"));
        return;
      }
      if (current.projectId !== meta.projectId || current.generation !== meta.generation || current.contentHash !== meta.contentHash) {
        onResult(null, new Error("IndexedDB current pointer is inconsistent"));
        return;
      }
      onResult(current);
    };
  };
}

/**
 * Persist a server snapshot and its current pointer in one IndexedDB
 * transaction. A candidate is never written before its browser hash passes.
 */
export async function cacheScopeKnowledgeSnapshot(
  candidate: ScopeKnowledgeSnapshot,
  options: SnapshotCacheOptions = {},
): Promise<SnapshotCacheAdoption> {
  if (!(await isScopeKnowledgeSnapshotHashValidBrowser(candidate, options.cryptoProvider))) {
    return { kind: "rejected", reason: "invalid-candidate" };
  }

  const database = await openSnapshotCache(options);
  return new Promise((resolve, reject) => {
    let outcome: SnapshotCacheAdoption | null = null;
    let settled = false;
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(
        [SNAPSHOT_STORE_NAME, SNAPSHOT_META_STORE_NAME],
        "readwrite",
      );
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.onerror = () => {
      if (!settled) {
        settled = true;
        database.close();
        reject(transaction.error ?? new Error("IndexedDB snapshot transaction failed"));
      }
    };
    transaction.onabort = () => {
      if (!settled) {
        settled = true;
        database.close();
        reject(transaction.error ?? new Error("IndexedDB snapshot transaction aborted"));
      }
    };
    transaction.oncomplete = () => {
      if (!settled) {
        settled = true;
        database.close();
        resolve(outcome ?? { kind: "rejected", reason: "invalid-current" });
      }
    };

    readCurrentInTransaction(transaction, candidate.projectId, (current, error) => {
      if (error) {
        transaction.abort();
        return;
      }
      outcome = decideSnapshotCacheAdoption(current, candidate);
      if (outcome.kind !== "adopted") return;
      const snapshots = transaction.objectStore(SNAPSHOT_STORE_NAME);
      const existingRequest = snapshots.get(candidate.snapshotId);
      existingRequest.onerror = () => transaction.abort();
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as ScopeKnowledgeSnapshot | undefined;
        if (existing && existing.contentHash !== candidate.contentHash) {
          outcome = { kind: "conflict", reason: "snapshot-id-different-hash" };
          return;
        }
        if (existing && existing.generation !== candidate.generation) {
          outcome = { kind: "conflict", reason: "snapshot-id-different-generation" };
          return;
        }
        // A snapshot observation is immutable. Reusing the same content hash
        // is idempotent; never overwrite its stored metadata.
        if (!existing) snapshots.add(candidate);
        transaction.objectStore(SNAPSHOT_META_STORE_NAME).put({
          projectId: candidate.projectId,
          currentSnapshotId: candidate.snapshotId,
          generation: candidate.generation,
          contentHash: candidate.contentHash,
        } satisfies SnapshotCacheMeta);
      };
    });
  });
}

/** Return the locally adopted snapshot, after verifying its browser hash. */
export async function getCachedCurrentScopeKnowledgeSnapshot(
  projectId: string,
  options: SnapshotCacheOptions = {},
): Promise<ScopeKnowledgeSnapshot | null> {
  const database = await openSnapshotCache(options);
  let snapshot: ScopeKnowledgeSnapshot | null;
  try {
    snapshot = await new Promise<ScopeKnowledgeSnapshot | null>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction([SNAPSHOT_STORE_NAME, SNAPSHOT_META_STORE_NAME], "readonly");
      } catch (error) {
        reject(error);
        return;
      }
      const metaRequest = transaction.objectStore(SNAPSHOT_META_STORE_NAME).get(projectId);
      metaRequest.onerror = () => reject(metaRequest.error ?? new Error("IndexedDB metadata read failed"));
      metaRequest.onsuccess = () => {
        const meta = metaRequest.result as SnapshotCacheMeta | undefined;
        if (!meta?.currentSnapshotId) {
          resolve(null);
          return;
        }
        const snapshotRequest = transaction.objectStore(SNAPSHOT_STORE_NAME).get(meta.currentSnapshotId);
        snapshotRequest.onerror = () => reject(snapshotRequest.error ?? new Error("IndexedDB snapshot read failed"));
        snapshotRequest.onsuccess = () => {
          const snapshot = snapshotRequest.result as ScopeKnowledgeSnapshot | undefined;
          if (!snapshot || snapshot.projectId !== meta.projectId || snapshot.generation !== meta.generation || snapshot.contentHash !== meta.contentHash) {
            resolve(null);
            return;
          }
          resolve(snapshot);
        };
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB read transaction failed"));
    });
  } finally {
    database.close();
  }
  if (!snapshot) return null;
  return await isScopeKnowledgeSnapshotHashValidBrowser(snapshot, options.cryptoProvider) ? snapshot : null;
}
