import {
  adoptObjectiveStateMirror,
  assertValidObjectiveStateMirror,
  deepFreeze,
  objectiveStateMirrorKey,
  type ObjectiveStateMirror,
  type ObjectiveStateMirrorDecision,
} from "./model-core.ts";

/** The mirror is deliberately a separate database from snapshots and outbox. */
export const OBJECTIVE_STATE_MIRROR_DB_NAME = "study-graph-objective-state-mirror" as const;
export const OBJECTIVE_STATE_MIRROR_DB_VERSION = 1 as const;
export const OBJECTIVE_STATE_MIRROR_STORE_NAME = "objective_state" as const;

type StoredObjectiveStateMirror = Readonly<{
  key: string;
  state: ObjectiveStateMirror;
  receivedAt: string;
}>;

export type ObjectiveStateMirrorOptions = Readonly<{
  indexedDB?: IDBFactory;
  dbName?: string;
  now?: () => string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}>;

export type ObjectiveStateMirrorSyncResult =
  | { kind: "adopted"; decision: Extract<ObjectiveStateMirrorDecision, { kind: "adopt" }> }
  | { kind: "ignored"; decision: Extract<ObjectiveStateMirrorDecision, { kind: "ignore" | "idempotent" }> }
  | { kind: "conflict"; decision: Extract<ObjectiveStateMirrorDecision, { kind: "conflict" }> }
  | { kind: "absent" }
  | { kind: "auth-required" }
  | { kind: "unavailable"; reason: "network" | "server" | "malformed" };

export class ObjectiveStateMirrorError extends Error {
  readonly code:
    | "mirror_unavailable"
    | "mirror_storage_failed"
    | "mirror_conflict"
    | "mirror_invalid";
  readonly decision?: ObjectiveStateMirrorDecision;

  constructor(
    code: ObjectiveStateMirrorError["code"],
    message: string = code,
    decision?: ObjectiveStateMirrorDecision,
  ) {
    super(message);
    this.name = "ObjectiveStateMirrorError";
    this.code = code;
    this.decision = decision;
  }
}

function indexedDbFactory(options: ObjectiveStateMirrorOptions): IDBFactory {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new ObjectiveStateMirrorError("mirror_unavailable", "IndexedDB is unavailable");
  return factory;
}

function openMirror(options: ObjectiveStateMirrorOptions): Promise<IDBDatabase> {
  const request = indexedDbFactory(options).open(
    options.dbName ?? OBJECTIVE_STATE_MIRROR_DB_NAME,
    OBJECTIVE_STATE_MIRROR_DB_VERSION,
  );
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECTIVE_STATE_MIRROR_STORE_NAME)) {
        database.createObjectStore(OBJECTIVE_STATE_MIRROR_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror open failed"));
    request.onblocked = () => reject(new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror upgrade is blocked"));
  });
}

function now(options: ObjectiveStateMirrorOptions) {
  return (options.now ?? (() => new Date().toISOString()))();
}

function copyState(state: ObjectiveStateMirror): ObjectiveStateMirror {
  return deepFreeze({ ...state });
}

function readStored(value: unknown): ObjectiveStateMirror | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Partial<StoredObjectiveStateMirror>;
  if (typeof stored.key !== "string" || !stored.state) return null;
  try {
    assertValidObjectiveStateMirror(stored.state);
    if (objectiveStateMirrorKey(stored.state) !== stored.key) return null;
    return copyState(stored.state);
  } catch {
    return null;
  }
}

/** Read the current local replica. A missing record is a valid empty mirror. */
export async function getObjectiveStateMirror(
  keyOrState: string | Pick<ObjectiveStateMirror, "learnerId" | "projectId" | "objectiveId" | "srsEpoch">,
  options: ObjectiveStateMirrorOptions = {},
): Promise<ObjectiveStateMirror | null> {
  const key = typeof keyOrState === "string" ? keyOrState : objectiveStateMirrorKey(keyOrState as ObjectiveStateMirror);
  const database = await openMirror(options);
  try {
    const transaction = database.transaction(OBJECTIVE_STATE_MIRROR_STORE_NAME, "readonly");
    const request = transaction.objectStore(OBJECTIVE_STATE_MIRROR_STORE_NAME).get(key);
    return await new Promise<ObjectiveStateMirror | null>((resolve, reject) => {
      request.onsuccess = () => resolve(readStored(request.result));
      request.onerror = () => reject(new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror read failed"));
      transaction.onerror = () => reject(new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror transaction failed"));
    });
  } finally {
    database.close();
  }
}

/**
 * Adopt a server response only after the state-revision rule is evaluated in
 * the same IndexedDB transaction as the pointer/value write. The mirror is a
 * replica: it never drives SRS scheduling, Scope, or an attempt payload.
 */
export async function persistObjectiveStateMirror(
  candidate: ObjectiveStateMirror,
  options: ObjectiveStateMirrorOptions = {},
): Promise<ObjectiveStateMirrorSyncResult> {
  try {
    assertValidObjectiveStateMirror(candidate);
  } catch (error) {
    throw new ObjectiveStateMirrorError("mirror_invalid", error instanceof Error ? error.message : "invalid mirror");
  }
  const immutableCandidate = copyState(candidate);
  const key = objectiveStateMirrorKey(immutableCandidate);
  const database = await openMirror(options);
  try {
    return await new Promise<ObjectiveStateMirrorSyncResult>((resolve, reject) => {
      const transaction = database.transaction(OBJECTIVE_STATE_MIRROR_STORE_NAME, "readwrite");
      const store = transaction.objectStore(OBJECTIVE_STATE_MIRROR_STORE_NAME);
      let result: ObjectiveStateMirrorSyncResult | null = null;
      let operationError: Error | null = null;
      transaction.oncomplete = () => {
        if (operationError) reject(operationError);
        else if (result) resolve(result);
        else reject(new ObjectiveStateMirrorError("mirror_storage_failed", "mirror transaction completed without a result"));
      };
      transaction.onerror = () => reject(operationError ?? new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror transaction failed"));
      transaction.onabort = () => reject(operationError ?? new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror transaction aborted"));

      const currentRequest = store.get(key);
      currentRequest.onerror = () => {
        operationError = new ObjectiveStateMirrorError("mirror_storage_failed", "IndexedDB mirror read failed");
        transaction.abort();
      };
      currentRequest.onsuccess = () => {
        const rawCurrent = currentRequest.result;
        const current = readStored(rawCurrent);
        // A present but malformed local record is not an empty mirror. Do not
        // overwrite it with a newer response without an explicit recovery
        // operation; fail closed and leave the stored value untouched.
        if (rawCurrent !== undefined && current === null) {
          operationError = new ObjectiveStateMirrorError("mirror_invalid", "stored Objective state mirror is malformed");
          transaction.abort();
          return;
        }
        let decision: ObjectiveStateMirrorDecision;
        try {
          decision = adoptObjectiveStateMirror(current, immutableCandidate);
        } catch (error) {
          operationError = new ObjectiveStateMirrorError("mirror_invalid", error instanceof Error ? error.message : "invalid mirror");
          transaction.abort();
          return;
        }
        if (decision.kind === "conflict") {
          operationError = new ObjectiveStateMirrorError("mirror_conflict", decision.reason, decision);
          transaction.abort();
          return;
        }
        if (decision.kind === "adopt") {
          store.put(deepFreeze({ key, state: immutableCandidate, receivedAt: now(options) } satisfies StoredObjectiveStateMirror));
          result = { kind: "adopted", decision };
        } else if (decision.kind === "ignore") {
          result = { kind: "ignored", decision };
        } else {
          result = { kind: "ignored", decision };
        }
      };
    });
  } finally {
    database.close();
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Foreground-only authenticated read. A 404 never deletes a local mirror;
 * network/server failure leaves the last server-derived replica untouched.
 */
export async function syncObjectiveStateMirror(
  options: ObjectiveStateMirrorOptions = {},
): Promise<ObjectiveStateMirrorSyncResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { kind: "unavailable", reason: "network" };
  let response: Response;
  try {
    response = await fetchImpl("/api/review/pilot/objective-state", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable", reason: "network" };
  }
  if (response.status === 401) return { kind: "auth-required" };
  if (response.status === 404) return { kind: "absent" };
  if (response.status >= 500 && response.status <= 599) return { kind: "unavailable", reason: "server" };
  if (!response.ok) return { kind: "unavailable", reason: "malformed" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "unavailable", reason: "malformed" };
  }
  const candidate = isObject(payload) && isObject(payload.state) ? payload.state : payload;
  if (!isObject(candidate)) return { kind: "unavailable", reason: "malformed" };
  try {
    return await persistObjectiveStateMirror(candidate as ObjectiveStateMirror, options);
  } catch (error) {
    if (error instanceof ObjectiveStateMirrorError && error.code === "mirror_conflict") {
      return {
        kind: "conflict",
        decision: error.decision && error.decision.kind === "conflict"
          ? error.decision
          : { kind: "conflict", reason: "same-revision-different-content" },
      };
    }
    return { kind: "unavailable", reason: "malformed" };
  }
}
