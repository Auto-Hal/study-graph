import assert from "node:assert/strict";
import test from "node:test";
import { createScopeKnowledgeSnapshot, type ScopeKnowledgeSnapshot } from "./snapshot.ts";
import {
  cacheScopeKnowledgeSnapshot,
  decideSnapshotCacheAdoption,
  getCachedCurrentScopeKnowledgeSnapshot,
  SNAPSHOT_CACHE_DB_VERSION,
  SNAPSHOT_META_STORE_NAME,
  SNAPSHOT_STORE_NAME,
} from "./snapshot-cache.ts";

/** Tiny disposable IndexedDB double so the cache transaction is exercised
 * without adding a browser/offline framework to the production bundle. */
class FakeRequest<T = unknown> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}

class FakeTransaction {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private pending = 0;
  private aborted = false;
  private committed = false;
  private readonly working = new Map<string, Map<string, unknown>>();
  private readonly database: FakeDatabase;

  constructor(database: FakeDatabase, names: string[]) {
    this.database = database;
    for (const name of names) this.working.set(name, new Map(database.stores.get(name) ?? []));
    queueMicrotask(() => this.maybeComplete());
  }

  objectStore(name: string) {
    const values = this.working.get(name);
    if (!values) throw new Error(`Unknown fake store: ${name}`);
    return new FakeObjectStore(this, values);
  }

  request<T>(operation: () => T) {
    const request = new FakeRequest<T>();
    this.pending += 1;
    queueMicrotask(() => {
      if (this.aborted) {
        this.pending -= 1;
        return;
      }
      try {
        request.result = operation();
        request.onsuccess?.();
      } catch (error) {
        request.error = error instanceof Error ? error : new Error(String(error));
        this.error = request.error;
        request.onerror?.();
        this.abort(request.error);
      } finally {
        this.pending -= 1;
        this.maybeComplete();
      }
    });
    return request;
  }

  abort(error = new Error("fake transaction aborted")) {
    if (this.aborted || this.committed) return;
    this.aborted = true;
    this.error = error;
    this.onabort?.();
  }

  private maybeComplete() {
    if (this.pending !== 0 || this.aborted || this.committed) return;
    this.committed = true;
    for (const [name, values] of this.working) this.database.stores.set(name, values);
    this.oncomplete?.();
  }
}

class FakeObjectStore {
  private readonly transaction: FakeTransaction;
  private readonly values: Map<string, unknown>;

  constructor(transaction: FakeTransaction, values: Map<string, unknown>) {
    this.transaction = transaction;
    this.values = values;
  }

  get(key: string) { return this.transaction.request(() => this.values.get(key)); }

  put(value: Record<string, unknown>) {
    return this.transaction.request(() => {
      const key = String(value.projectId ?? value.snapshotId);
      this.values.set(key, value);
      return value;
    });
  }

  add(value: Record<string, unknown>) {
    return this.transaction.request(() => {
      const key = String(value.snapshotId ?? value.projectId);
      if (this.values.has(key)) throw new Error("ConstraintError");
      this.values.set(key, value);
      return value;
    });
  }
}

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) };
  createObjectStore(name: string) {
    const values = new Map<string, unknown>();
    this.stores.set(name, values);
    return { name };
  }
  transaction(names: string[]) { return new FakeTransaction(this, names); }
  close() {}
}

class FakeIndexedDb {
  private readonly databases = new Map<string, FakeDatabase>();
  open(name: string, _version: number) {
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      let database = this.databases.get(name);
      const upgrade = !database;
      if (!database) {
        database = new FakeDatabase();
        this.databases.set(name, database);
      }
      request.result = database;
      if (upgrade) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

function snapshot(overrides: Partial<Omit<ScopeKnowledgeSnapshot, "schemaVersion" | "contentHash">> = {}): ScopeKnowledgeSnapshot {
  return createScopeKnowledgeSnapshot({
    snapshotId: "11111111-1111-4111-8111-111111111111",
    projectId: "kuzushiji",
    generation: 1,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
    publishedAt: "2030-01-01T00:01:01.000Z",
    validUntil: "2030-01-01T02:01:00.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "kuzushiji-v1",
    sourceEvidence: { sourceIdentifiers: ["notion:characters"], paginationComplete: true, relationCompleteness: true },
    scopeDecisions: [],
    knowledgeProjection: { rows: ["a"] },
    ...overrides,
  });
}

test("cache adoption is generation monotonic and same-generation conflict-safe", () => {
  const first = snapshot();
  assert.deepEqual(decideSnapshotCacheAdoption(null, first), { kind: "adopted", reason: "no-current" });
  assert.deepEqual(decideSnapshotCacheAdoption(first, snapshot({ generation: 2 })), { kind: "adopted", reason: "newer-generation" });
  assert.deepEqual(decideSnapshotCacheAdoption(snapshot({ generation: 2 }), first), { kind: "ignored", reason: "older-generation" });
  assert.deepEqual(decideSnapshotCacheAdoption(first, first), { kind: "ignored", reason: "same-generation" });
  assert.deepEqual(decideSnapshotCacheAdoption(first, snapshot({ knowledgeProjection: { rows: ["b"] } })), {
    kind: "conflict",
    reason: "same-generation-different-hash",
  });
});

test("cache contract names an atomic v1 database with immutable snapshot and pointer stores", () => {
  assert.equal(SNAPSHOT_CACHE_DB_VERSION, 1);
  assert.equal(SNAPSHOT_STORE_NAME, "snapshots");
  assert.equal(SNAPSHOT_META_STORE_NAME, "snapshot_meta");
});

test("malformed candidate and current are rejected before adoption", () => {
  const valid = snapshot();
  assert.deepEqual(decideSnapshotCacheAdoption(null, { ...valid, contentHash: "not-a-hash" }), {
    kind: "rejected",
    reason: "invalid-candidate",
  });
  assert.deepEqual(decideSnapshotCacheAdoption({ ...valid, contentHash: "not-a-hash" }, valid), {
    kind: "rejected",
    reason: "invalid-current",
  });
});

test("IndexedDB cache adopts, ignores, and conflicts by generation", async () => {
  const indexedDB = new FakeIndexedDb() as unknown as IDBFactory;
  const options = { indexedDB, dbName: "phase4e-3-cache-adoption" };
  const first = snapshot();
  const higher = snapshot({ snapshotId: "22222222-2222-4222-8222-222222222222", generation: 2 });
  const lower = snapshot({ snapshotId: "33333333-3333-4333-8333-333333333333", generation: 1 });
  const conflict = snapshot({ snapshotId: "44444444-4444-4444-8444-444444444444", generation: 2, knowledgeProjection: { rows: ["different"] } });

  assert.deepEqual(await cacheScopeKnowledgeSnapshot(first, options), { kind: "adopted", reason: "no-current" });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(higher, options), { kind: "adopted", reason: "newer-generation" });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(lower, options), { kind: "ignored", reason: "older-generation" });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(higher, options), { kind: "ignored", reason: "same-generation" });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(conflict, options), { kind: "conflict", reason: "same-generation-different-hash" });
  assert.equal((await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji", options))?.snapshotId, higher.snapshotId);
});

test("invalid snapshot hash is not persisted and an aborted transaction does not advance the pointer", async () => {
  const indexedDB = new FakeIndexedDb() as unknown as IDBFactory;
  const options = { indexedDB, dbName: "phase4e-3-cache-atomicity" };
  const first = snapshot();
  const higher = snapshot({ snapshotId: "22222222-2222-4222-8222-222222222222", generation: 2 });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(first, options), { kind: "adopted", reason: "no-current" });
  assert.deepEqual(await cacheScopeKnowledgeSnapshot({ ...higher, contentHash: "f".repeat(64) }, options), {
    kind: "rejected",
    reason: "invalid-candidate",
  });
  assert.equal((await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji", options))?.snapshotId, first.snapshotId);

  const failingIndexedDB = new FakeIndexedDb();
  const failingOptions = { indexedDB: failingIndexedDB as unknown as IDBFactory, dbName: "phase4e-3-cache-failure" };
  assert.deepEqual(await cacheScopeKnowledgeSnapshot(first, failingOptions), { kind: "adopted", reason: "no-current" });
  const database = await new Promise<FakeDatabase>((resolve) => {
    const request = failingIndexedDB.open("phase4e-3-cache-failure", 1);
    request.onsuccess = () => resolve(request.result);
  });
  const originalTransaction = database.transaction.bind(database);
  database.transaction = ((names: string[]) => {
    const transaction = originalTransaction(names);
    const originalObjectStore = transaction.objectStore.bind(transaction);
    transaction.objectStore = ((name: string) => {
      const store = originalObjectStore(name);
      if (name === SNAPSHOT_META_STORE_NAME) {
        const originalPut = store.put.bind(store);
        store.put = ((value: Record<string, unknown>) => {
          const request = originalPut(value);
          transaction.abort(new Error("simulated write failure"));
          return request;
        }) as typeof store.put;
      }
      return store;
    }) as typeof transaction.objectStore;
    return transaction;
  }) as typeof database.transaction;
  await assert.rejects(cacheScopeKnowledgeSnapshot(higher, failingOptions));
  assert.equal((await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji", failingOptions))?.snapshotId, first.snapshotId);
});
