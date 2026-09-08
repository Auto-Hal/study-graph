import {
  createOfflineAttemptDraft,
  deepFreeze,
  type OfflineAttemptCommitted,
  type OfflineAttemptRecord,
  type OfflineDeliveryClassification,
  type OfflineReceiptRecord,
  type OfflineTransportDiagnostics,
} from "./outbox-core.ts";
import { transitionOfflineAttempt } from "./outbox-core.ts";

export const ATTEMPT_OUTBOX_DB_NAME = "study-graph-attempt-outbox" as const;
export const ATTEMPT_OUTBOX_DB_VERSION = 1 as const;
export const ATTEMPT_OUTBOX_STORE_NAME = "attempt_outbox" as const;
export const ATTEMPT_RECEIPTS_STORE_NAME = "attempt_receipts" as const;
export const ATTEMPT_OUTBOX_INSTANCE_INDEX = "by_instance_id" as const;

export type AttemptOutboxTransportMetadata = Readonly<{
  createdAt: string;
  updatedAt: string;
  lastAttemptedAt: string | null;
  retryCount: number;
  lastTransportError: string | null;
  /** Response metadata is mutable transport history, never submission identity. */
  lastHttpStatus?: number | null;
  lastServerErrorCode?: string | null;
  lastTransportObservedAt?: string | null;
}>;

/** The submission is immutable; transport metadata is the only mutable part. */
export type PersistedOfflineAttempt = Readonly<{
  attemptId: string;
  instanceId: string;
  record: OfflineAttemptCommitted;
  transport: AttemptOutboxTransportMetadata;
}>;

export type PersistedOfflineReceipt = Readonly<{
  attemptId: string;
  instanceId: string;
  receipt: OfflineReceiptRecord;
  receivedAt: string;
}>;

export type OfflineAttemptStatusCounts = Readonly<{
  pending: number;
  authRequired: number;
  blocked: number;
}>;

/** Counts only durable records that still need user/transport attention. */
export function countOfflineAttemptStatuses(
  records: readonly PersistedOfflineAttempt[],
): OfflineAttemptStatusCounts {
  return records.reduce((counts, record) => {
    if (record.record.status === "pending" || record.record.status === "sending") counts.pending += 1;
    else if (record.record.status === "auth-required") counts.authRequired += 1;
    else if (record.record.status === "blocked") counts.blocked += 1;
    return counts;
  }, { pending: 0, authRequired: 0, blocked: 0 });
}

export type AttemptOutboxOptions = Readonly<{
  indexedDB?: IDBFactory;
  dbName?: string;
  now?: () => string;
}>;

export class OfflineOutboxError extends Error {
  readonly code:
    | "attempt_conflict"
    | "instance_already_answered"
    | "outbox_unavailable"
    | "outbox_storage_failed"
    | "receipt_conflict"
    | "invalid_record";

  constructor(code: OfflineOutboxError["code"], message?: string) {
    super(message ?? code);
    this.name = "OfflineOutboxError";
    this.code = code;
  }
}

function indexedDbFactory(options: AttemptOutboxOptions): IDBFactory {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new OfflineOutboxError("outbox_unavailable", "IndexedDB is unavailable");
  return factory;
}

function clock(options: AttemptOutboxOptions) {
  return options.now ?? (() => new Date().toISOString());
}

function openAttemptOutbox(options: AttemptOutboxOptions): Promise<IDBDatabase> {
  const request = indexedDbFactory(options).open(
    options.dbName ?? ATTEMPT_OUTBOX_DB_NAME,
    ATTEMPT_OUTBOX_DB_VERSION,
  );
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ATTEMPT_OUTBOX_STORE_NAME)) {
        const store = database.createObjectStore(ATTEMPT_OUTBOX_STORE_NAME, { keyPath: "attemptId" });
        store.createIndex(ATTEMPT_OUTBOX_INSTANCE_INDEX, "instanceId", { unique: true });
      }
      if (!database.objectStoreNames.contains(ATTEMPT_RECEIPTS_STORE_NAME)) {
        database.createObjectStore(ATTEMPT_RECEIPTS_STORE_NAME, { keyPath: "attemptId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflineOutboxError("outbox_storage_failed", "IndexedDB open failed"));
    request.onblocked = () => reject(new OfflineOutboxError("outbox_storage_failed", "IndexedDB upgrade is blocked"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new OfflineOutboxError("outbox_storage_failed"));
  });
}

function assertCommitted(record: OfflineAttemptRecord): asserts record is OfflineAttemptCommitted {
  if (record.status === "draft" || !record.submission || !record.requestHash || !/^[0-9a-f]{64}$/.test(record.requestHash)) {
    throw new OfflineOutboxError("invalid_record", "Only a committed attempt can be stored");
  }
}

function makePersisted(
  record: OfflineAttemptCommitted,
  options: AttemptOutboxOptions,
  previous?: AttemptOutboxTransportMetadata,
): PersistedOfflineAttempt {
  const now = clock(options)();
  return deepFreeze({
    attemptId: record.submission.attemptId,
    instanceId: record.submission.instanceId,
    record,
    transport: {
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      lastAttemptedAt: previous?.lastAttemptedAt ?? null,
      retryCount: previous?.retryCount ?? 0,
      lastTransportError: previous?.lastTransportError ?? null,
      lastHttpStatus: previous?.lastHttpStatus ?? null,
      lastServerErrorCode: previous?.lastServerErrorCode ?? null,
      lastTransportObservedAt: previous?.lastTransportObservedAt ?? null,
    },
  });
}

function asPersisted(value: unknown): PersistedOfflineAttempt | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedOfflineAttempt>;
  if (typeof candidate.attemptId !== "string" || typeof candidate.instanceId !== "string" || !candidate.record || !candidate.record.submission || !candidate.record.requestHash || !candidate.transport) return null;
  // IndexedDB returns a structured clone, so freezing here protects callers
  // from accidentally mutating the in-memory view of the immutable payload.
  return deepFreeze(candidate as PersistedOfflineAttempt);
}

function sameSubmission(left: PersistedOfflineAttempt, right: OfflineAttemptCommitted) {
  return left.record.requestHash === right.requestHash
    && left.record.submission.attemptId === right.submission.attemptId
    && left.record.submission.instanceId === right.submission.instanceId;
}

/**
 * Commit the immutable pending payload before any network request. A unique
 * instance index prevents two local attempts for one server-issued instance.
 */
export async function commitOfflineAttempt(
  record: OfflineAttemptRecord,
  options: AttemptOutboxOptions = {},
): Promise<{ record: PersistedOfflineAttempt; reused: boolean }> {
  assertCommitted(record);
  if (record.status !== "pending") throw new OfflineOutboxError("invalid_record", "Only pending attempts may be durably committed");
  const database = await openAttemptOutbox(options);
  try {
    return await new Promise<{ record: PersistedOfflineAttempt; reused: boolean }>((resolve, reject) => {
      const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME);
      let result: { record: PersistedOfflineAttempt; reused: boolean } | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => operationError ? reject(operationError) : result ? resolve(result) : reject(new OfflineOutboxError("outbox_storage_failed"));
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));

      const byAttempt = store.get(record.submission.attemptId);
      byAttempt.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
      byAttempt.onsuccess = () => {
        const existing = asPersisted(byAttempt.result);
        if (existing) {
          if (sameSubmission(existing, record)) result = { record: deepFreeze(existing), reused: true };
          else operationError = new OfflineOutboxError("attempt_conflict", "A different submission already uses this attemptId");
          return;
        }
        const byInstance = store.index(ATTEMPT_OUTBOX_INSTANCE_INDEX).get(record.submission.instanceId);
        byInstance.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
        byInstance.onsuccess = () => {
          const instanceRecord = asPersisted(byInstance.result);
          if (instanceRecord) {
            if (sameSubmission(instanceRecord, record)) result = { record: deepFreeze(instanceRecord), reused: true };
            else operationError = new OfflineOutboxError("instance_already_answered", "A different local attempt already uses this instanceId");
            return;
          }
          const persisted = makePersisted(record, options);
          store.add(persisted);
          result = { record: persisted, reused: false };
        };
      };
    });
  } catch (error) {
    if (error instanceof OfflineOutboxError) throw error;
    throw new OfflineOutboxError("outbox_storage_failed", error instanceof Error ? error.message : "IndexedDB write failed");
  } finally {
    database.close();
  }
}

export async function getOfflineAttempt(
  attemptId: string,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineAttempt | null> {
  const database = await openAttemptOutbox(options);
  try {
    const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME).get(attemptId));
    return asPersisted(result);
  } finally {
    database.close();
  }
}

export async function findOfflineAttemptByInstanceId(
  instanceId: string,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineAttempt | null> {
  const database = await openAttemptOutbox(options);
  try {
    const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME).index(ATTEMPT_OUTBOX_INSTANCE_INDEX).get(instanceId));
    return asPersisted(result);
  } finally {
    database.close();
  }
}

export async function listOfflineAttempts(options: AttemptOutboxOptions = {}): Promise<PersistedOfflineAttempt[]> {
  const database = await openAttemptOutbox(options);
  try {
    const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readonly");
    const values = await requestResult(transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME).getAll());
    return values.map(asPersisted).filter((value): value is PersistedOfflineAttempt => value !== null);
  } finally {
    database.close();
  }
}

/** Mark sending state in a transaction. Terminal records are never rewound. */
export async function markOfflineAttemptSending(
  attemptId: string,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineAttempt | null> {
  const database = await openAttemptOutbox(options);
  try {
    return await new Promise<PersistedOfflineAttempt | null>((resolve, reject) => {
      const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME);
      let result: PersistedOfflineAttempt | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      const request = store.get(attemptId);
      request.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
      request.onsuccess = () => {
        const current = asPersisted(request.result);
        if (!current || current.record.status !== "pending") {
          result = current;
          return;
        }
        const next = transitionOfflineAttempt(current.record, { type: "begin-send" }) as OfflineAttemptCommitted;
        const now = clock(options)();
        const persisted = deepFreeze({
          ...current,
          record: next,
          transport: {
            ...current.transport,
            updatedAt: now,
            lastAttemptedAt: now,
            retryCount: current.transport.retryCount + 1,
            lastTransportError: null,
          },
        });
        store.put(persisted);
        result = persisted;
      };
    });
  } finally {
    database.close();
  }
}

/** Recover an in-flight request after reload/crash; no payload is changed. */
export async function recoverSendingOfflineAttempts(options: AttemptOutboxOptions = {}): Promise<number> {
  const database = await openAttemptOutbox(options);
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME);
      let recovered = 0;
      let operationError: Error | null = null;
      transaction.oncomplete = () => resolve(recovered);
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      const request = store.getAll();
      request.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
      request.onsuccess = () => {
        const now = clock(options)();
        for (const value of request.result) {
          const current = asPersisted(value);
          if (!current || current.record.status !== "sending") continue;
          const next = transitionOfflineAttempt(current.record, { type: "crash-recovered" }) as OfflineAttemptCommitted;
          store.put(deepFreeze({
            ...current,
            record: next,
            transport: { ...current.transport, updatedAt: now },
          }));
          recovered += 1;
        }
      };
    });
  } finally {
    database.close();
  }
}

/**
 * Apply a delivery classification. Accepted receipts and the terminal outbox
 * state are written in one IndexedDB transaction.
 */
export async function applyOfflineDelivery(
  attemptId: string,
  classification: OfflineDeliveryClassification,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineAttempt | null> {
  const database = await openAttemptOutbox(options);
  try {
    return await new Promise<PersistedOfflineAttempt | null>((resolve, reject) => {
      const stores = classification.kind === "accepted"
        ? [ATTEMPT_OUTBOX_STORE_NAME, ATTEMPT_RECEIPTS_STORE_NAME]
        : [ATTEMPT_OUTBOX_STORE_NAME];
      const transaction = database.transaction(stores, "readwrite");
      const outbox = transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME);
      let result: PersistedOfflineAttempt | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => operationError ? reject(operationError) : resolve(result);
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      const request = outbox.get(attemptId);
      request.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
      request.onsuccess = () => {
        const current = asPersisted(request.result);
        const canConsume = current?.record.status === "sending" || current?.record.status === "auth-required";
        if (!current || classification.kind === "receipt-lookup-required" || !canConsume) {
          result = current;
          return;
        }
        const next = transitionOfflineAttempt(current.record, classification.kind === "retryable"
          ? { type: "retryable-failure", reason: classification.reason }
          : classification.kind === "auth-required"
            ? { type: "auth-required" }
            : classification.kind === "accepted"
              ? { type: "accepted", receipt: classification.receipt }
              : { type: "blocked", reason: classification.reason }) as OfflineAttemptCommitted;
        const now = clock(options)();
        const diagnostics: OfflineTransportDiagnostics | undefined = classification.diagnostics;
        const persisted = deepFreeze({
          ...current,
          record: next,
          transport: {
            ...current.transport,
            updatedAt: now,
            lastTransportError: classification.kind === "retryable"
              ? classification.reason
              : classification.kind === "blocked"
                ? classification.reason
                : null,
            lastHttpStatus: diagnostics?.httpStatus ?? current.transport.lastHttpStatus ?? null,
            lastServerErrorCode: diagnostics?.serverErrorCode ?? current.transport.lastServerErrorCode ?? null,
            lastTransportObservedAt: diagnostics?.observedAt ?? current.transport.lastTransportObservedAt ?? null,
          },
        });
        if (classification.kind === "accepted") {
          const receipts = transaction.objectStore(ATTEMPT_RECEIPTS_STORE_NAME);
          const existingRequest = receipts.get(attemptId);
          existingRequest.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
          existingRequest.onsuccess = () => {
            const existing = existingRequest.result as PersistedOfflineReceipt | undefined;
            if (existing) {
              if (JSON.stringify(existing.receipt) !== JSON.stringify(classification.receipt)) {
                operationError = new OfflineOutboxError("receipt_conflict", "A different receipt already exists for this attempt");
                transaction.abort();
                return;
              }
            } else {
              receipts.add(deepFreeze({
                attemptId,
                instanceId: current.instanceId,
                receipt: classification.receipt,
                receivedAt: now,
              } satisfies PersistedOfflineReceipt));
            }
            outbox.put(persisted);
            result = persisted;
          };
        } else {
          outbox.put(persisted);
          result = persisted;
        }
      };
    });
  } finally {
    database.close();
  }
}

export async function getOfflineReceipt(
  attemptId: string,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineReceipt | null> {
  const database = await openAttemptOutbox(options);
  try {
    const transaction = database.transaction(ATTEMPT_RECEIPTS_STORE_NAME, "readonly");
    const value = await requestResult(transaction.objectStore(ATTEMPT_RECEIPTS_STORE_NAME).get(attemptId));
    return value ? value as PersistedOfflineReceipt : null;
  } finally {
    database.close();
  }
}

/** Move auth-required records back to pending after an explicit reauth. */
export async function markOfflineAttemptReauthenticated(
  attemptId: string,
  options: AttemptOutboxOptions = {},
): Promise<PersistedOfflineAttempt | null> {
  const database = await openAttemptOutbox(options);
  try {
    return await new Promise<PersistedOfflineAttempt | null>((resolve, reject) => {
      const transaction = database.transaction(ATTEMPT_OUTBOX_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTEMPT_OUTBOX_STORE_NAME);
      let result: PersistedOfflineAttempt | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new OfflineOutboxError("outbox_storage_failed"));
      const request = store.get(attemptId);
      request.onerror = () => { operationError = new OfflineOutboxError("outbox_storage_failed"); transaction.abort(); };
      request.onsuccess = () => {
        const current = asPersisted(request.result);
        if (!current || current.record.status !== "auth-required") {
          result = current;
          return;
        }
        const next = transitionOfflineAttempt(current.record, { type: "reauthenticated" }) as OfflineAttemptCommitted;
        const persisted = deepFreeze({ ...current, record: next, transport: { ...current.transport, updatedAt: clock(options)() } });
        store.put(persisted);
        result = persisted;
      };
    });
  } finally {
    database.close();
  }
}

export { createOfflineAttemptDraft };
