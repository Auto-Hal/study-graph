import {
  applyOfflineDelivery,
  commitOfflineAttempt,
  createOfflineAttemptDraft,
  getOfflineAttempt,
  reconcileBlockedAttemptWithAuthoritativeReceipt,
  updateOfflineAttemptTransportMetadata,
  markOfflineAttemptReauthenticated,
  markOfflineAttemptSending,
  type AttemptOutboxOptions,
  type PersistedOfflineAttempt,
} from "./attempt-outbox.ts";
import {
  authoritativeReceiptResult,
  canonicalizeJson,
  createOfflineSubmission,
  OFFLINE_SUBMISSION_SCHEMA_VERSION,
  REQUEST_HASH_VERSION,
  type OfflineReceiptKind,
  type OfflineSubmission,
} from "./model-core.ts";
import {
  classifyOfflineServerOutcome,
  classifyStoredReceiptLookup,
  safeTransportErrorCode,
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

function transportDiagnostics(status: number | null, payload?: Record<string, unknown>) {
  return {
    httpStatus: status,
    serverErrorCode: safeTransportErrorCode(payload?.error),
    observedAt: new Date().toISOString(),
  } as const;
}

function withTransportDiagnostics(
  classification: OfflineDeliveryClassification,
  diagnostics: ReturnType<typeof transportDiagnostics>,
): OfflineDeliveryClassification {
  return { ...classification, diagnostics };
}

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

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
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
    let response: Response;
    response = await fetchImpl(`/api/review/pilot/receipt?instanceId=${encodeURIComponent(record.instanceId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (response.status === 401) return withTransportDiagnostics({ kind: "auth-required" }, transportDiagnostics(response.status));
    if (response.status === 404) return withTransportDiagnostics({ kind: "blocked", reason: "incomplete-authoritative-receipt" }, transportDiagnostics(response.status));
    if (response.status === 429) return withTransportDiagnostics({ kind: "retryable", reason: "rate-limit" }, transportDiagnostics(response.status));
    if (response.status >= 500 && response.status <= 599) return withTransportDiagnostics({ kind: "retryable", reason: "server" }, transportDiagnostics(response.status));
    if (!response.ok) return withTransportDiagnostics({ kind: "blocked", reason: "malformed-response" }, transportDiagnostics(response.status));
    const payload = await parseJson(response);
    return withTransportDiagnostics(classifyReceiptLookupResponse(payload, {
      attemptId: record.record.submission.attemptId,
      instanceId: record.instanceId,
      requestHash: record.record.requestHash,
      receiptKind,
    }), transportDiagnostics(response.status, payload));
  } catch {
    return withTransportDiagnostics({ kind: "retryable", reason: "network" }, transportDiagnostics(null));
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

/** Exact six-field wire tuple sent to the existing server validator. */
export function requestBody(record: PersistedOfflineAttempt) {
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

export type ManualRecoveryFailure = "integrity" | "validation" | "auth-required" | "network" | "server" | "rate-limit" | "semantic";

export type ManualBlockedPilotRecoveryResult =
  | { kind: "accepted"; record: PersistedOfflineAttempt; result: StoredPilotReceiptResult }
  | {
      kind: "blocked";
      record: PersistedOfflineAttempt;
      reason: import("./model-core.ts").OfflineBlockedReason;
      phase: "integrity" | "validation" | "send" | "receipt-lookup";
      failure: ManualRecoveryFailure;
      httpStatus: number | null;
      serverErrorCode: string | null;
    }
  | { kind: "terminal"; record: PersistedOfflineAttempt };

type ManualBlockedPilotRecoveryOptions = AttemptOutboxOptions & {
  receiptKind?: OfflineReceiptKind;
  fetchImpl?: FetchLike;
  cryptoProvider?: Pick<Crypto, "subtle">;
};

function manualFailureKind(
  classification: OfflineDeliveryClassification,
  phase: "validation" | "send" | "receipt-lookup",
): ManualRecoveryFailure {
  if (classification.kind === "retryable") return classification.reason === "network"
    ? "network"
    : classification.reason === "rate-limit" ? "rate-limit" : "server";
  if (classification.kind === "auth-required") return "auth-required";
  if (classification.kind === "blocked") {
    if (classification.reason === "attempt-conflict" || classification.reason === "instance-already-answered") return "semantic";
    if (phase === "validation" || classification.diagnostics?.httpStatus === 400) return "validation";
    return "semantic";
  }
  return phase === "validation" ? "validation" : "semantic";
}

async function preserveBlockedTransportDiagnostics(
  record: PersistedOfflineAttempt,
  diagnostics: ReturnType<typeof transportDiagnostics>,
  options: AttemptOutboxOptions,
  transportError?: string | null,
) {
  try {
    return await updateOfflineAttemptTransportMetadata(record.attemptId, {
      expectedStatus: "blocked",
      httpStatus: diagnostics.httpStatus,
      serverErrorCode: diagnostics.serverErrorCode,
      observedAt: diagnostics.observedAt,
      transportError: transportError === undefined ? record.record.blockedReason : transportError,
    }, options) ?? record;
  } catch {
    // Diagnostic history is best-effort. A storage failure must never turn a
    // durable blocked submission into a different state or trigger a retry.
    return record;
  }
}

function blockedManualResult(
  record: PersistedOfflineAttempt,
  phase: "integrity" | "validation" | "send" | "receipt-lookup",
  failure: ManualRecoveryFailure,
  diagnostics: ReturnType<typeof transportDiagnostics>,
  reason: import("./model-core.ts").OfflineBlockedReason = record.record.blockedReason ?? "malformed-response",
): ManualBlockedPilotRecoveryResult {
  return {
    kind: "blocked",
    record,
    reason,
    phase,
    failure,
    httpStatus: diagnostics.httpStatus,
    serverErrorCode: diagnostics.serverErrorCode,
  };
}

function isAcceptedRecord(record: PersistedOfflineAttempt) {
  return record.record.status === "accepted-applied" || record.record.status === "accepted-no-srs";
}

function canonicalizeSubmissionForComparison(submission: OfflineSubmission) {
  return canonicalizeJson(submission);
}

/**
 * A guarded metadata write can observe a concurrent terminal update. Return
 * that current authority instead of manufacturing a blocked result around an
 * accepted (or otherwise non-blocked) record.
 */
function manualResultAfterBlockedMetadataUpdate(
  record: PersistedOfflineAttempt,
  phase: "integrity" | "validation" | "send" | "receipt-lookup",
  failure: ManualRecoveryFailure,
  diagnostics: ReturnType<typeof transportDiagnostics>,
  reason?: import("./model-core.ts").OfflineBlockedReason,
): ManualBlockedPilotRecoveryResult {
  if (isAcceptedRecord(record)) return { kind: "accepted", record, result: resultForAccepted(record) };
  if (record.record.status !== "blocked") return { kind: "terminal", record };
  return blockedManualResult(record, phase, failure, diagnostics, reason);
}

/**
 * Explicit, user-triggered recovery for a blocked pilot attempt. The generic
 * state machine remains terminal: this operation never marks the record
 * sending or pending. It validates the immutable tuple, performs a fresh
 * validation-only request, then sends the same tuple once. Only a complete
 * authoritative receipt can atomically reconcile blocked to accepted.
 */
export async function recoverBlockedPilotAttemptExplicitly(
  attemptId: string,
  options: ManualBlockedPilotRecoveryOptions = {},
): Promise<ManualBlockedPilotRecoveryResult | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("fetch is unavailable");

  let current = await getOfflineAttempt(attemptId, options);
  if (!current) return null;
  if (isAcceptedRecord(current)) return { kind: "accepted", record: current, result: resultForAccepted(current) };
  if (current.record.status !== "blocked") return { kind: "terminal", record: current };

  const submission = current.record.submission;
  const expected = {
    attemptId: current.attemptId,
    instanceId: current.instanceId,
    requestHash: current.record.requestHash,
    submission,
  } as const;
  const invalidDiagnostics = transportDiagnostics(null);
  if (
    submission.submissionSchemaVersion !== OFFLINE_SUBMISSION_SCHEMA_VERSION
    || submission.requestHashVersion !== REQUEST_HASH_VERSION
    || submission.attemptId !== current.attemptId
    || submission.instanceId !== current.instanceId
    || !/^[0-9a-f]{64}$/.test(current.record.requestHash)
  ) {
    const preserved = await preserveBlockedTransportDiagnostics(current, invalidDiagnostics, options, "request-hash-mismatch");
    return manualResultAfterBlockedMetadataUpdate(preserved, "integrity", "integrity", invalidDiagnostics);
  }

  let recomputedHash: string;
  try {
    recomputedHash = await hashExerciseAttemptRequestBrowser({
      attemptId: submission.attemptId,
      instanceId: submission.instanceId,
      rawAnswer: submission.rawAnswer,
      selfEvaluation: submission.selfEvaluation,
      responseMs: submission.responseMs,
      usedHint: submission.usedHint,
    }, options.cryptoProvider);
  } catch {
    const preserved = await preserveBlockedTransportDiagnostics(current, invalidDiagnostics, options, "request-hash-unavailable");
    return manualResultAfterBlockedMetadataUpdate(preserved, "integrity", "integrity", invalidDiagnostics);
  }
  if (recomputedHash !== current.record.requestHash) {
    const preserved = await preserveBlockedTransportDiagnostics(current, invalidDiagnostics, options, "request-hash-mismatch");
    return manualResultAfterBlockedMetadataUpdate(preserved, "integrity", "integrity", invalidDiagnostics);
  }

  // Record only mutable transport history. This operation intentionally does
  // not enter the ordinary in-flight state and keeps status blocked while the
  // validation and submission requests are in flight.
  current = await updateOfflineAttemptTransportMetadata(current.attemptId, {
    expectedStatus: "blocked",
    markAttempted: true,
    incrementRetry: true,
    transportError: null,
    httpStatus: null,
    serverErrorCode: null,
    observedAt: null,
  }, options) ?? current;
  if (isAcceptedRecord(current)) return { kind: "accepted", record: current, result: resultForAccepted(current) };
  if (current.record.status !== "blocked") return { kind: "terminal", record: current };

  let validationResponse: Response;
  try {
    validationResponse = await fetchImpl("/api/review/pilot/attempt/validate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(current)),
    });
  } catch {
    const diagnostics = transportDiagnostics(null);
    const preserved = await preserveBlockedTransportDiagnostics(current, diagnostics, options, "network");
    return manualResultAfterBlockedMetadataUpdate(preserved, "validation", "network", diagnostics);
  }
  const validationPayload = await parseJson(validationResponse);
  const validationDiagnostics = transportDiagnostics(validationResponse.status, validationPayload);
  if (validationResponse.status !== 200 || validationPayload.ok !== true) {
    const failure = validationResponse.status === 401
      ? "auth-required" as const
      : validationResponse.status === 429
        ? "rate-limit" as const
        : validationResponse.status >= 500
          ? "server" as const
          : validationResponse.status >= 400
            ? "validation" as const
            : "semantic" as const;
    const preserved = await preserveBlockedTransportDiagnostics(current, validationDiagnostics, options, failure === "auth-required" ? "auth-required" : "validation-failed");
    return manualResultAfterBlockedMetadataUpdate(preserved, "validation", failure, validationDiagnostics);
  }

  // Re-read after validation. A concurrent operation may have reconciled the
  // record; an accepted terminal record wins and no second POST is sent.
  current = await getOfflineAttempt(attemptId, options);
  if (!current) return null;
  if (isAcceptedRecord(current)) return { kind: "accepted", record: current, result: resultForAccepted(current) };
  if (current.record.status !== "blocked") return { kind: "terminal", record: current };
  if (
    current.record.requestHash !== expected.requestHash
    || current.record.submission.attemptId !== expected.attemptId
    || current.record.submission.instanceId !== expected.instanceId
    || canonicalizeSubmissionForComparison(current.record.submission) !== canonicalizeSubmissionForComparison(expected.submission)
  ) {
    const preserved = await preserveBlockedTransportDiagnostics(current, invalidDiagnostics, options, "request-hash-mismatch");
    return manualResultAfterBlockedMetadataUpdate(preserved, "integrity", "integrity", invalidDiagnostics, "attempt-conflict");
  }

  let response: Response;
  let classification: OfflineDeliveryClassification;
  try {
    response = await fetchImpl("/api/review/pilot/attempt", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(current)),
    });
    const payload = await parseJson(response);
    classification = withTransportDiagnostics(classifyOfflineServerOutcome({
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
    }), transportDiagnostics(response.status, payload));
  } catch {
    const diagnostics = transportDiagnostics(null);
    const preserved = await preserveBlockedTransportDiagnostics(current, diagnostics, options, "network");
    return manualResultAfterBlockedMetadataUpdate(preserved, "send", "network", diagnostics);
  }

  let outcomePhase: "send" | "receipt-lookup" = "send";
  if (classification.kind === "receipt-lookup-required") {
    outcomePhase = "receipt-lookup";
    classification = await lookupStoredReceipt(current, options.receiptKind ?? "objective", fetchImpl);
  }

  if (classification.kind === "accepted") {
    try {
      const reconciled = await reconcileBlockedAttemptWithAuthoritativeReceipt(
        attemptId,
        expected,
        classification.receipt,
        options,
      );
      if (!reconciled) return null;
      if (isAcceptedRecord(reconciled)) {
        return { kind: "accepted", record: reconciled, result: resultForAccepted(reconciled) };
      }
      if (reconciled.record.status === "blocked") {
        const diagnostics = classification.diagnostics ?? transportDiagnostics(response.status);
        return blockedManualResult(reconciled, "send", "semantic", diagnostics, "incomplete-authoritative-receipt");
      }
      return { kind: "terminal", record: reconciled };
    } catch {
      const latest = await getOfflineAttempt(attemptId, options);
      if (latest && isAcceptedRecord(latest)) return { kind: "accepted", record: latest, result: resultForAccepted(latest) };
      const diagnostics = classification.diagnostics ?? transportDiagnostics(response.status);
      const preserved = latest && latest.record.status === "blocked"
        ? await preserveBlockedTransportDiagnostics(latest, diagnostics, options, "receipt-reconciliation-failed")
        : current;
      return manualResultAfterBlockedMetadataUpdate(preserved, outcomePhase, "semantic", diagnostics, "incomplete-authoritative-receipt");
    }
  }

  const diagnostics = classification.diagnostics ?? transportDiagnostics(response.status);
  const failure = manualFailureKind(classification, outcomePhase);
  const transportError = classification.kind === "retryable"
    ? classification.reason
    : classification.kind === "auth-required"
      ? "auth-required"
      : classification.kind === "blocked"
        ? classification.reason
        : "manual-recovery-failed";
  const preserved = await preserveBlockedTransportDiagnostics(current, diagnostics, options, transportError);
  return manualResultAfterBlockedMetadataUpdate(
    preserved,
    outcomePhase,
    failure,
    diagnostics,
    classification.kind === "blocked" ? classification.reason : preserved.record.blockedReason ?? "malformed-response",
  );
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
    classification = withTransportDiagnostics(classifyOfflineServerOutcome({
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
    }), transportDiagnostics(response.status, payload));
  } catch {
    classification = withTransportDiagnostics({ kind: "retryable", reason: "network" }, transportDiagnostics(null));
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
