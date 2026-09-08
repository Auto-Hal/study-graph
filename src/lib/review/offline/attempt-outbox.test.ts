import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTEMPT_OUTBOX_INSTANCE_INDEX,
  ATTEMPT_OUTBOX_STORE_NAME,
  ATTEMPT_RECEIPTS_STORE_NAME,
  countOfflineAttemptStatuses,
  commitOfflineAttempt,
  findOfflineAttemptByInstanceId,
  getOfflineAttempt,
  getOfflineReceipt,
  recoverSendingOfflineAttempts,
  type PersistedOfflineAttempt,
} from "./attempt-outbox.ts";
import { createOfflineAttemptDraft, createOfflineReceiptRecord, createOfflineSubmission, type OfflineAttemptCommitted } from "./model-core.ts";
import { transitionOfflineAttempt } from "./outbox.ts";

class FakeRequest<T = unknown> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}

class FakeIndex {
  private readonly transaction: FakeTransaction;
  private readonly values: Map<string, unknown>;
  constructor(transaction: FakeTransaction, values: Map<string, unknown>) {
    this.transaction = transaction;
    this.values = values;
  }
  get(key: string) {
    return this.transaction.request(() => Array.from(this.values.values()).find((value) => (value as { instanceId?: string }).instanceId === key));
  }
}

class FakeObjectStore {
  private readonly transaction: FakeTransaction;
  private readonly name: string;
  private readonly values: Map<string, unknown>;
  constructor(transaction: FakeTransaction, name: string, values: Map<string, unknown>) {
    this.transaction = transaction;
    this.name = name;
    this.values = values;
  }
  createIndex() { return {}; }
  index(name: string) {
    if (name !== ATTEMPT_OUTBOX_INSTANCE_INDEX) throw new Error("unknown index");
    return new FakeIndex(this.transaction, this.values);
  }
  get(key: string) { return this.transaction.request(() => this.values.get(key)); }
  getAll() { return this.transaction.request(() => Array.from(this.values.values())); }
  add(value: Record<string, unknown>) {
    return this.transaction.request(() => {
      const key = String(value.attemptId);
      if (this.values.has(key)) throw new Error("ConstraintError");
      if (this.name === ATTEMPT_OUTBOX_STORE_NAME && Array.from(this.values.values()).some((entry) => (entry as { instanceId?: string }).instanceId === value.instanceId)) throw new Error("ConstraintError");
      this.values.set(key, value);
      return value;
    });
  }
  put(value: Record<string, unknown>) {
    return this.transaction.request(() => {
      this.values.set(String(value.attemptId), value);
      return value;
    });
  }
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
  constructor(database: FakeDatabase, names: string | string[]) {
    this.database = database;
    for (const name of (Array.isArray(names) ? names : [names])) this.working.set(name, new Map(database.stores.get(name) ?? []));
  }
  objectStore(name: string) {
    const values = this.working.get(name);
    if (!values) throw new Error(`Unknown fake store: ${name}`);
    return new FakeObjectStore(this, name, values);
  }
  request<T>(operation: () => T) {
    const request = new FakeRequest<T>();
    this.pending += 1;
    queueMicrotask(() => {
      if (this.aborted) { this.pending -= 1; return; }
      try { request.result = operation(); request.onsuccess?.(); }
      catch (error) { request.error = error instanceof Error ? error : new Error(String(error)); this.error = request.error; request.onerror?.(); this.abort(request.error); }
      finally { this.pending -= 1; this.maybeComplete(); }
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

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) };
  createObjectStore(name: string) {
    this.stores.set(name, new Map());
    return { createIndex: () => ({}) };
  }
  transaction(names: string | string[]) { return new FakeTransaction(this, names); }
  close() {}
}

class FakeIndexedDb {
  private readonly databases = new Map<string, FakeDatabase>();
  open(name: string, _version: number) {
    const request = new FakeRequest<FakeDatabase>();
    queueMicrotask(() => {
      let database = this.databases.get(name);
      const upgrade = !database;
      if (!database) { database = new FakeDatabase(); this.databases.set(name, database); }
      request.result = database;
      if (upgrade) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

const attemptId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const otherAttemptId = "33333333-3333-4333-8333-333333333333";

function pending(id = attemptId, instance = instanceId): OfflineAttemptCommitted {
  const submission = createOfflineSubmission({ attemptId: id, instanceId: instance, rawAnswer: "あ", selfEvaluation: "good", responseMs: 100, usedHint: false });
  return transitionOfflineAttempt(createOfflineAttemptDraft(), {
    type: "confirm-submission",
    submission,
    requestHash: "a".repeat(64),
  }) as OfflineAttemptCommitted;
}

function receipt(id = attemptId) {
  return createOfflineReceiptRecord("legacy", {
    receiptVersion: 1,
    attemptId: id,
    instanceId,
    acceptedAt: "2030-01-01T00:00:00.000Z",
    gradingStatus: "graded",
    isCorrect: true,
    effectiveSrsGrade: "good",
    srsApplied: true,
    srsReason: "applied",
    legacyReviewAttemptId: 7,
    reviewStateBefore: null,
    reviewStateAfter: { due_at: "2030-01-02T00:00:00.000Z" },
  }, instanceId, id);
}

function options(indexedDB: FakeIndexedDb, dbName: string) {
  return { indexedDB: indexedDB as unknown as IDBFactory, dbName, now: () => "2030-01-01T00:00:00.000Z" };
}

test("outbox commits one instance and reuses identical submission", async () => {
  const indexedDB = new FakeIndexedDb();
  const opts = options(indexedDB, "outbox-commit");
  const first = await commitOfflineAttempt(pending(), opts);
  assert.equal(first.reused, false);
  const second = await commitOfflineAttempt(pending(), opts);
  assert.equal(second.reused, true);
  await assert.rejects(() => commitOfflineAttempt(pending(otherAttemptId), opts), (error: unknown) => (error as { code?: string }).code === "instance_already_answered");
  assert.equal((await findOfflineAttemptByInstanceId(instanceId, opts))?.attemptId, attemptId);
});

test("sending recovers to pending and terminal receipt is retained", async () => {
  const indexedDB = new FakeIndexedDb();
  const opts = options(indexedDB, "outbox-recovery");
  const committed = await commitOfflineAttempt(pending(), opts);
  const sending = await import("./attempt-outbox.ts").then(({ markOfflineAttemptSending }) => markOfflineAttemptSending(attemptId, opts));
  assert.equal(sending?.record.status, "sending");
  assert.equal(await recoverSendingOfflineAttempts(opts), 1);
  const recovered = await getOfflineAttempt(attemptId, opts);
  assert.equal(recovered?.record.status, "pending");
  const applied = await import("./attempt-outbox.ts").then(({ applyOfflineDelivery }) => applyOfflineDelivery(attemptId, { kind: "accepted", receipt: receipt() }, opts));
  // A recovered record must be moved to sending again before accepting delivery.
  assert.equal(applied?.record.status, "pending");
  assert.equal(committed.record.record.submission.rawAnswer, "あ");
  assert.equal(await getOfflineReceipt(attemptId, opts), null);
});

test("accepted receipt and terminal outbox update are persisted together", async () => {
  const indexedDB = new FakeIndexedDb();
  const opts = options(indexedDB, "outbox-receipt");
  await commitOfflineAttempt(pending(), opts);
  const { markOfflineAttemptSending, applyOfflineDelivery } = await import("./attempt-outbox.ts");
  await markOfflineAttemptSending(attemptId, opts);
  const updated = await applyOfflineDelivery(attemptId, { kind: "accepted", receipt: receipt() }, opts);
  assert.equal(updated?.record.status, "accepted-applied");
  assert.equal((await getOfflineAttempt(attemptId, opts))?.record.status, "accepted-applied");
  assert.equal((await getOfflineReceipt(attemptId, opts))?.attemptId, attemptId);
});

test("storage absence fails before any transport can be attempted", async () => {
  await assert.rejects(() => commitOfflineAttempt(pending(), { indexedDB: undefined }), /IndexedDB is unavailable/);
});

test("durable status counts exclude accepted records and separate attention states", () => {
  const sending = transitionOfflineAttempt(pending(), { type: "begin-send" }) as OfflineAttemptCommitted;
  const authRequired = transitionOfflineAttempt(sending, { type: "auth-required" }) as OfflineAttemptCommitted;
  const blocked = transitionOfflineAttempt(sending, { type: "blocked", reason: "attempt-conflict" }) as OfflineAttemptCommitted;
  const accepted = transitionOfflineAttempt(sending, { type: "accepted", receipt: receipt() }) as OfflineAttemptCommitted;
  const persisted = (record: PersistedOfflineAttempt["record"]): PersistedOfflineAttempt => ({
    attemptId,
    instanceId,
    record,
    transport: {
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
      lastAttemptedAt: null,
      retryCount: 0,
      lastTransportError: null,
    },
  });
  assert.deepEqual(countOfflineAttemptStatuses([
    persisted(pending()),
    persisted(sending),
    persisted(authRequired),
    persisted(blocked),
    persisted(accepted),
  ]), { pending: 2, authRequired: 1, blocked: 1 });
});

void ATTEMPT_RECEIPTS_STORE_NAME;
