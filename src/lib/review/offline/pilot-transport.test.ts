import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  ATTEMPT_OUTBOX_INSTANCE_INDEX,
  ATTEMPT_OUTBOX_STORE_NAME,
  applyOfflineDelivery,
  commitOfflineAttempt,
  getOfflineAttempt,
  markOfflineAttemptSending,
} from "./attempt-outbox.ts";
import { createOfflineAttemptDraft } from "./model-core.ts";
import { transitionOfflineAttempt } from "./outbox.ts";
import { commitPilotOfflineAttempt, sendPilotOutboxAttempt } from "./pilot-transport.ts";

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
      finally { this.pending -= 1; this.completeIfReady(); }
    });
    return request;
  }
  abort(error = new Error("fake transaction aborted")) {
    if (this.aborted || this.committed) return;
    this.aborted = true;
    this.error = error;
    this.onabort?.();
  }
  private completeIfReady() {
    if (this.pending !== 0 || this.aborted || this.committed) return;
    this.committed = true;
    for (const [name, values] of this.working) this.database.stores.set(name, values);
    this.oncomplete?.();
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
    return { get: (key: string) => this.transaction.request(() => Array.from(this.values.values()).find((value) => (value as { instanceId?: string }).instanceId === key)) };
  }
  get(key: string) { return this.transaction.request(() => this.values.get(key)); }
  getAll() { return this.transaction.request(() => Array.from(this.values.values())); }
  add(value: Record<string, unknown>) {
    return this.transaction.request(() => {
      const key = String(value.attemptId);
      if (this.values.has(key) || (this.name === ATTEMPT_OUTBOX_STORE_NAME && Array.from(this.values.values()).some((entry) => (entry as { instanceId?: string }).instanceId === value.instanceId))) throw new Error("ConstraintError");
      this.values.set(key, value);
      return value;
    });
  }
  put(value: Record<string, unknown>) {
    return this.transaction.request(() => { this.values.set(String(value.attemptId), value); return value; });
  }
}

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) };
  createObjectStore(name: string) { this.stores.set(name, new Map()); return { createIndex: () => ({}) }; }
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
const browserCrypto = webcrypto as unknown as Pick<Crypto, "subtle">;

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptVersion: 1,
    attemptId,
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
    ...overrides,
  };
}

function pendingRecord() {
  const submission = {
    attemptId,
    instanceId,
    rawAnswer: "あ",
    selfEvaluation: "good" as const,
    responseMs: 100,
    usedHint: false,
  };
  return transitionOfflineAttempt(createOfflineAttemptDraft(), {
    type: "confirm-submission",
    submission,
    requestHash: "a".repeat(64),
  });
}

function opts(indexedDB: FakeIndexedDb, dbName: string) {
  return { indexedDB: indexedDB as unknown as IDBFactory, dbName, now: () => "2030-01-01T00:00:00.000Z" };
}

async function seeded(indexedDB: FakeIndexedDb, dbName: string) {
  return commitOfflineAttempt(pendingRecord(), opts(indexedDB, dbName));
}

test("2xx authoritative receipt is persisted and accepted", async () => {
  const indexedDB = new FakeIndexedDb();
  const options = opts(indexedDB, "transport-accepted");
  await seeded(indexedDB, "transport-accepted");
  let postCount = 0;
  const result = await sendPilotOutboxAttempt(attemptId, {
    ...options,
    receiptKind: "legacy",
    fetchImpl: async (_input, init) => {
      postCount += 1;
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ saved: true, receipt: receipt() }), { status: 200 });
    },
  });
  assert.equal(postCount, 1);
  assert.equal(result?.kind, "accepted");
  assert.equal(result && result.kind === "accepted" ? result.result.isCorrect : null, true);
});

test("network and 5xx/429 keep a durable submission pending", async () => {
  for (const [name, fetchImpl] of [
    ["network", async () => { throw new Error("offline"); }],
    ["server", async () => new Response(JSON.stringify({ error: "busy" }), { status: 503 })],
    ["rate", async () => new Response(JSON.stringify({ error: "busy" }), { status: 429 })],
  ] as const) {
    const indexedDB = new FakeIndexedDb();
    const options = opts(indexedDB, `transport-${name}`);
    await seeded(indexedDB, `transport-${name}`);
    const result = await sendPilotOutboxAttempt(attemptId, { ...options, receiptKind: "legacy", fetchImpl });
    assert.equal(result?.kind, "pending");
  }
});

test("receipt lookup resolves instance_already_answered without regrading", async () => {
  for (const [name, stored] of [["same", receipt()], ["different", receipt({ attemptId: "33333333-3333-4333-8333-333333333333" })]] as const) {
    const indexedDB = new FakeIndexedDb();
    const options = opts(indexedDB, `transport-lookup-${name}`);
    await seeded(indexedDB, `transport-lookup-${name}`);
    const calls: string[] = [];
    const result = await sendPilotOutboxAttempt(attemptId, {
      ...options,
      receiptKind: "legacy",
      fetchImpl: async (input) => {
        calls.push(String(input));
        if (String(input).includes("/attempt")) return new Response(JSON.stringify({ error: "instance_already_answered" }), { status: 409 });
        return new Response(JSON.stringify({ attemptId: stored.attemptId, requestHash: "a".repeat(64), receiptKind: "legacy", receipt: stored }), { status: 200 });
      },
    });
    assert.equal(result?.kind, name === "same" ? "accepted" : "blocked");
    assert.equal(calls.length, 2);
  }
});

test("401 becomes auth-required and malformed receipt is blocked", async () => {
  const indexedDB = new FakeIndexedDb();
  const options = opts(indexedDB, "transport-auth");
  await seeded(indexedDB, "transport-auth");
  const auth = await sendPilotOutboxAttempt(attemptId, { ...options, receiptKind: "legacy", fetchImpl: async () => new Response("", { status: 401 }) });
  assert.equal(auth?.kind, "auth-required");

  const malformedDb = new FakeIndexedDb();
  const malformedOptions = opts(malformedDb, "transport-malformed");
  await seeded(malformedDb, "transport-malformed");
  const malformed = await sendPilotOutboxAttempt(attemptId, { ...malformedOptions, receiptKind: "legacy", fetchImpl: async () => new Response(JSON.stringify({ receipt: { attemptId, instanceId } }), { status: 200 }) });
  assert.equal(malformed?.kind, "blocked");
});

test("durable commit failure prevents any pilot transport", async () => {
  await assert.rejects(
    () => commitPilotOfflineAttempt({
      attemptId,
      instanceId,
      rawAnswer: "あ",
      selfEvaluation: "good",
      responseMs: 100,
      usedHint: false,
    }, { indexedDB: undefined, cryptoProvider: browserCrypto }),
    /IndexedDB is unavailable/,
  );
});

async function seedAuthRequired(indexedDB: FakeIndexedDb, dbName: string) {
  const options = opts(indexedDB, dbName);
  await seeded(indexedDB, dbName);
  await markOfflineAttemptSending(attemptId, options);
  await applyOfflineDelivery(attemptId, { kind: "auth-required" }, options);
  return options;
}

test("auth-required probes authentication before any POST", async () => {
  const cases = [
    {
      name: "401",
      response: async () => new Response("", { status: 401 }),
      expected: "auth-required",
    },
    {
      name: "network",
      response: async () => { throw new Error("offline"); },
      expected: "auth-required",
    },
    {
      name: "server",
      response: async () => new Response("", { status: 503 }),
      expected: "auth-required",
    },
    {
      name: "rate-limit",
      response: async () => new Response("", { status: 429 }),
      expected: "auth-required",
    },
  ] as const;
  for (const currentCase of cases) {
    const indexedDB = new FakeIndexedDb();
    const options = await seedAuthRequired(indexedDB, "auth-probe-" + currentCase.name);
    const calls: string[] = [];
    const result = await sendPilotOutboxAttempt(attemptId, {
      ...options,
      receiptKind: "legacy",
      fetchImpl: async (input) => {
        calls.push(String(input));
        return currentCase.response();
      },
    });
    assert.equal(result?.kind, currentCase.expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].includes("/receipt?"), true);
    assert.equal((await getOfflineAttempt(attemptId, options))?.record.status, "auth-required");
  }
});

test("auth-required 404 proves a live session and retries the same submission", async () => {
  const indexedDB = new FakeIndexedDb();
  const options = await seedAuthRequired(indexedDB, "auth-probe-404");
  const calls: string[] = [];
  const result = await sendPilotOutboxAttempt(attemptId, {
    ...options,
    receiptKind: "legacy",
    fetchImpl: async (input) => {
      calls.push(String(input));
      if (calls.length === 1) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ saved: true, receipt: receipt() }), { status: 200 });
    },
  });
  assert.equal(result?.kind, "accepted");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].includes("/receipt?"), true);
  assert.equal(calls[1].includes("/attempt"), true);
});

test("auth-required complete stored receipt is accepted without POST", async () => {
  const indexedDB = new FakeIndexedDb();
  const options = await seedAuthRequired(indexedDB, "auth-probe-receipt");
  const calls: string[] = [];
  const result = await sendPilotOutboxAttempt(attemptId, {
    ...options,
    receiptKind: "legacy",
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        attemptId,
        requestHash: "a".repeat(64),
        receiptKind: "legacy",
        receipt: receipt(),
      }), { status: 200 });
    },
  });
  assert.equal(result?.kind, "accepted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("/receipt?"), true);
  assert.equal((await getOfflineAttempt(attemptId, options))?.record.status, "accepted-applied");
});

test("auth-required malformed receipt fails closed without discarding the submission", async () => {
  const indexedDB = new FakeIndexedDb();
  const options = await seedAuthRequired(indexedDB, "auth-probe-malformed");
  const result = await sendPilotOutboxAttempt(attemptId, {
    ...options,
    receiptKind: "legacy",
    fetchImpl: async () => new Response(JSON.stringify({
      attemptId,
      requestHash: "a".repeat(64),
      receiptKind: "legacy",
      receipt: { attemptId, instanceId },
    }), { status: 200 }),
  });
  assert.equal(result?.kind, "blocked");
  const persisted = await getOfflineAttempt(attemptId, options);
  assert.equal(persisted?.record.status, "blocked");
  assert.equal(persisted?.record.submission.rawAnswer, "あ");
});
