import {
  applyOfflineDelivery,
  commitOfflineAttempt,
  createOfflineAttemptDraft,
  getOfflineAttempt,
  markOfflineAttemptReauthenticated,
  markOfflineAttemptSending,
  type AttemptOutboxOptions,
  type PersistedOfflineAttempt,
} from "./attempt-outbox.ts";
import {
  authoritativeReceiptResult,
  createOfflineSubmission,
  type OfflineReceiptKind,
} from "./model-core.ts";
import {
  classifyOfflineServerOutcome,
  classifyStoredReceiptLookup,
  type OfflineDeliveryClassification,
} from "./outbox-core.ts";
import type { StoredPilotReceiptResult } from "../exercises/receipt.ts";
import { hashExerciseAttemptRequestBrowser } from "../exercises/attempt-browser.ts";
import { transitionOfflineAttempt } from "./outbox-core.ts";
import type { OfflineSubmissionInput } from "./model-core.ts";

export type PilotOutboxSyncResult =
  | { kind: "accepted"; record: PersistedOfflineAttempt; result: StoredPilotReceiptResult }
  | { kind: "pending"; record: PersistedOfflineAttempt; reason: "network" | "server" | "rate-limit" }
  | { kind: "auth-required"; record: PersistedOfflineAttempt }
  | { kind: "blocked"; record: PersistedOfflineAttempt; reason: string }
  | { kind: "terminal"; record: PersistedOfflineAttempt; result?: StoredPilotReceiptResult };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Build and durably commit one immutable submission before transport starts. */
export async function commitPilotOfflineAttempt(
  input: OfflineSubmissionInput,
  options: AttemptOutboxOptions & { cryptoProvider?: Pick<Crypto, "subtle"> } = {},
) {
  const draft = createOfflineAttemptDraft({ createdAt: new Date().toISOString() });
  const submission = createOfflineSubmission(input);
  const requestHash = await hashExerciseAttemptRequestBrowser({
    attemptId: submission.attemptId,
    instanceId: submission.instanceId,
    rawAnswer: submission.rawAnswer,
    selfEvaluation: submission.selfEvaluation,
    responseMs: submission.responseMs,
    usedHint: submission.usedHint,
  }, options.cryptoProvider);
  const record = transitionOfflineAttempt(draft, {
    type: "confirm-submission",
    submission,
    requestHash,
  });
  return commitOfflineAttempt(record, options);
}

function parseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function receiptFromStoredRecord(record: PersistedOfflineAttempt): StoredPilotReceiptResult {
  if (!record.record.receipt) throw new Error("stored_receipt_incomplete");
  return authoritativeReceiptResult(record.record.receipt, record.instanceId);
}

function classifyReceiptLookupResponse(
  payload: Record<string, unknown>,
  context: { attemptId: string; instanceId: string; requestHash: string; receiptKind: OfflineReceiptKind },
): Extract<OfflineDeliveryClassification, { kind: "accepted" | "blocked" }> {
  if (payload.receipt === undefined) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
  const lookup = classifyStoredReceiptLookup({
    attemptId: payload.attemptId,
    receipt: payload.receipt,
    receiptKind: payload.receiptKind as OfflineReceiptKind | undefined,
    requestHash: payload.requestHash,
  }, context);
  return lookup;
}

async function lookupStoredReceipt(
  record: PersistedOfflineAttempt,
  receiptKind: OfflineReceiptKind,
  fetchImpl: FetchLike,
): Promise<OfflineDeliveryClassification> {
  try {
    const response = await fetchImpl(`/api/review/pilot/receipt?instanceId=${encodeURIComponent(record.instanceId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (response.status === 401) return { kind: "auth-required" };
    if (response.status === 404) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
    if (response.status === 429) return { kind: "retryable", reason: "rate-limit" };
    if (response.status >= 500 && response.status <= 599) return { kind: "retryable", reason: "server" };
    if (!response.ok) return { kind: "blocked", reason: "malformed-response" };
    return classifyReceiptLookupResponse(await parseJson(response), {
      attemptId: record.record.submission.attemptId,
      instanceId: record.instanceId,
      requestHash: record.record.requestHash,
      receiptKind,
    });
  } catch {
    return { kind: "retryable", reason: "network" };
  }
}

type AuthRecoveryClassification =
  | { kind: "reauthenticated" }
  | { kind: "auth-required" }
  | { kind: "accepted"; receipt: import("./model-core.ts").OfflineReceiptRecord }
  | { kind: "blocked"; reason: import("./model-core.ts").OfflineBlockedReason };

/**
 * Verify that authentication has recovered before changing auth-required to
 * pending. A receipt response can also finish the attempt without a POST.
 */
async function probeAuthentication(
  record: PersistedOfflineAttempt,
  receiptKind: OfflineReceiptKind,
  fetchImpl: FetchLike,
): Promise<AuthRecoveryClassification> {
  try {
    const response = await fetchImpl(`/api/review/pilot/receipt?instanceId=${encodeURIComponent(record.instanceId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (response.status === 401) return { kind: "auth-required" };
    if (response.status === 404) return { kind: "reauthenticated" };
    if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
      // A transient response does not prove that the session recovered.
      return { kind: "auth-required" };
    }
    if (!response.ok) return { kind: "blocked", reason: "malformed-response" };
    return classifyReceiptLookupResponse(await parseJson(response), {
      attemptId: record.record.submission.attemptId,
      instanceId: record.instanceId,
      requestHash: record.record.requestHash,
      receiptKind,
    });
  } catch {
    // Keep the record auth-required until a successful probe (404 or a valid
    // stored receipt) proves that reauthentication completed.
    return { kind: "auth-required" };
  }
}

function requestBody(record: PersistedOfflineAttempt) {
  const submission = record.record.submission;
  return {
    attemptId: submission.attemptId,
    instanceId: submission.instanceId,
    rawAnswer: submission.rawAnswer,
    selfEvaluation: submission.selfEvaluation,
    responseMs: submission.responseMs,
    usedHint: submission.usedHint,
  };
}

function resultForAccepted(record: PersistedOfflineAttempt): StoredPilotReceiptResult {
  return receiptFromStoredRecord(record);
}

/**
 * Send one durable pilot submission. The caller must commit the pending
 * record first; this function never creates or mutates the submission.
 */
export async function sendPilotOutboxAttempt(
  attemptId: string,
  options: AttemptOutboxOptions & {
    receiptKind?: OfflineReceiptKind;
    fetchImpl?: FetchLike;
  } = {},
): Promise<PilotOutboxSyncResult | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("fetch is unavailable");
  let current = await getOfflineAttempt(attemptId, options);
  if (!current) return null;
  if (current.record.status === "accepted-applied" || current.record.status === "accepted-no-srs") {
    return { kind: "terminal", record: current, result: resultForAccepted(current) };
  }
  if (current.record.status === "blocked") return { kind: "terminal", record: current };
  if (current.record.status === "auth-required") {
    const recovery = await probeAuthentication(current, options.receiptKind ?? "objective", fetchImpl);
    if (recovery.kind === "auth-required") return { kind: "auth-required", record: current };
    if (recovery.kind === "accepted" || recovery.kind === "blocked") {
      const updated = await applyOfflineDelivery(attemptId, recovery, options);
      if (!updated) return null;
      if (updated.record.status === "accepted-applied" || updated.record.status === "accepted-no-srs") {
        return { kind: "accepted", record: updated, result: resultForAccepted(updated) };
      }
      if (updated.record.status === "blocked") {
        return { kind: "blocked", record: updated, reason: updated.record.blockedReason ?? "malformed-response" };
      }
      return { kind: "auth-required", record: updated };
    }
    current = await markOfflineAttemptReauthenticated(attemptId, options);
    if (!current) return null;
    if (current.record.status === "accepted-applied" || current.record.status === "accepted-no-srs") {
      return { kind: "terminal", record: current, result: resultForAccepted(current) };
    }
    if (current.record.status === "blocked") return { kind: "terminal", record: current };
  }
  if (current.record.status !== "pending") return { kind: "terminal", record: current };
  current = await markOfflineAttemptSending(attemptId, options);
  if (!current) return null;
  if (current.record.status !== "sending") {
    if (current.record.status === "accepted-applied" || current.record.status === "accepted-no-srs") {
      return { kind: "terminal", record: current, result: resultForAccepted(current) };
    }
    if (current.record.status === "blocked") return { kind: "terminal", record: current };
    return { kind: "pending", record: current, reason: "network" };
  }

  let classification: OfflineDeliveryClassification;
  try {
    const response = await fetchImpl("/api/review/pilot/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(current)),
    });
    const payload = await parseJson(response);
    classification = classifyOfflineServerOutcome({
      type: "http",
      status: response.status,
      code: typeof payload.error === "string" ? payload.error : undefined,
      attemptId: payload.attemptId,
      requestHash: payload.requestHash,
      receipt: payload.receipt,
      receiptKind: options.receiptKind,
    }, {
      attemptId: current.record.submission.attemptId,
      instanceId: current.instanceId,
      receiptKind: options.receiptKind ?? "objective",
      requestHash: current.record.requestHash,
    });
  } catch {
    classification = { kind: "retryable", reason: "network" };
  }

  if (classification.kind === "receipt-lookup-required") {
    classification = await lookupStoredReceipt(current, options.receiptKind ?? "objective", fetchImpl);
  }

  const updated = await applyOfflineDelivery(attemptId, classification, options);
  if (!updated) return null;
  // A concurrent tab may have completed this attempt while this request was
  // in flight. The transaction returns the current record; its terminal
  // state and stored receipt remain the authority over this response.
  if (updated.record.status === "accepted-applied" || updated.record.status === "accepted-no-srs") {
    return { kind: "accepted", record: updated, result: resultForAccepted(updated) };
  }
  if (updated.record.status === "blocked") {
    return { kind: "blocked", record: updated, reason: updated.record.blockedReason ?? "malformed-response" };
  }
  if (classification.kind === "accepted") {
    return { kind: "accepted", record: updated, result: resultForAccepted(updated) };
  }
  if (classification.kind === "retryable") return { kind: "pending", record: updated, reason: classification.reason };
  if (classification.kind === "auth-required") return { kind: "auth-required", record: updated };
  if (classification.kind === "blocked") return { kind: "blocked", record: updated, reason: classification.reason };
  return { kind: "pending", record: updated, reason: "network" };
}

/** Flush every durable pending/auth-required pilot submission, old instances included. */
export async function flushPilotAttemptOutbox(
  options: AttemptOutboxOptions & { receiptKind?: OfflineReceiptKind; fetchImpl?: FetchLike } = {},
) {
  const { listOfflineAttempts } = await import("./attempt-outbox.ts");
  const records = await listOfflineAttempts(options);
  const results: Array<PilotOutboxSyncResult> = [];
  for (const record of records) {
    if (record.record.status !== "pending" && record.record.status !== "auth-required") continue;
    const result = await sendPilotOutboxAttempt(record.attemptId, options);
    if (result) results.push(result);
  }
  return results;
}

export function offlineReceiptForResponse(record: PersistedOfflineAttempt) {
  try {
    return resultForAccepted(record);
  } catch {
    return null;
  }
}
