import {
  authoritativeReceiptResult,
  createOfflineReceiptRecord,
  confirmOfflineSubmission,
  createOfflineAttemptDraft,
  type OfflineAttemptCommitted,
  type OfflineAttemptDraft,
  type OfflineAttemptRecord,
  type OfflineBlockedReason,
  type OfflineReceiptKind,
  type OfflineReceiptRecord,
  type OfflineSubmissionInput,
  deepFreeze,
} from "./model.ts";

export type OfflineAttemptEvent =
  | { type: "confirm-submission"; submission: OfflineSubmissionInput }
  | { type: "begin-send" }
  | { type: "retryable-failure"; reason: "network" | "server" | "rate-limit" }
  | { type: "auth-required" }
  | { type: "reauthenticated" }
  | { type: "crash-recovered" }
  | { type: "accepted"; receipt: OfflineReceiptRecord }
  | { type: "blocked"; reason: OfflineBlockedReason };

export type OfflineDeliveryClassification =
  | { kind: "retryable"; reason: "network" | "server" | "rate-limit" }
  | { kind: "auth-required" }
  /** The transport must perform an authenticated stored-receipt lookup first. */
  | { kind: "receipt-lookup-required"; reason: "instance-already-answered" }
  | { kind: "accepted"; receipt: OfflineReceiptRecord }
  | { kind: "blocked"; reason: OfflineBlockedReason };

export type OfflineServerOutcome =
  | { type: "network-error" }
  | { type: "http"; status: number; code?: string; receipt?: unknown; receiptKind?: OfflineReceiptKind };

function isReceiptKind(value: unknown): value is OfflineReceiptKind {
  return value === "legacy" || value === "objective";
}

/**
 * Classify the result of the authenticated receipt lookup requested by an
 * instance_already_answered response. A lookup result is terminal only after
 * its own complete receipt has been validated and its attemptId compared.
 */
export function classifyStoredReceiptLookup(
  lookup: { receipt?: unknown; receiptKind?: OfflineReceiptKind },
  context: { attemptId: string; instanceId: string; receiptKind: OfflineReceiptKind },
): Extract<OfflineDeliveryClassification, { kind: "accepted" | "blocked" }> {
  if (lookup.receipt === undefined) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
  const kind = lookup.receiptKind ?? context.receiptKind;
  if (!isReceiptKind(kind)) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
  try {
    const receipt = createOfflineReceiptRecord(kind, lookup.receipt, context.instanceId);
    const restored = authoritativeReceiptResult(receipt, context.instanceId);
    if (restored.attemptId !== context.attemptId) {
      return { kind: "blocked", reason: "instance-already-answered" };
    }
    return { kind: "accepted", receipt };
  } catch {
    return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
  }
}

/**
 * Classify transport/server results without grading or repairing a receipt
 * from the current submission. An instance_already_answered response only
 * becomes accepted when a complete receipt proves it is this attempt.
 */
export function classifyOfflineServerOutcome(
  outcome: OfflineServerOutcome,
  context: { attemptId: string; instanceId: string; receiptKind: OfflineReceiptKind },
): OfflineDeliveryClassification {
  if (outcome.type === "network-error") return { kind: "retryable", reason: "network" };
  if (outcome.status === 401) return { kind: "auth-required" };
  if (outcome.status === 429) return { kind: "retryable", reason: "rate-limit" };
  if (outcome.status >= 500 && outcome.status <= 599) return { kind: "retryable", reason: "server" };

  const code = outcome.code;
  if (code === "attempt_conflict") return { kind: "blocked", reason: "attempt-conflict" };
  if (code === "unsupported_submission_version") return { kind: "blocked", reason: "unsupported-submission-version" };

  if (code === "instance_already_answered") {
    // A 409 without a receipt is not enough to decide whether this request is
    // a retry. The authenticated transport must look up the stored receipt.
    if (outcome.receipt === undefined) return { kind: "receipt-lookup-required", reason: "instance-already-answered" };
    return classifyStoredReceiptLookup(outcome, context);
  }

  if (outcome.status >= 200 && outcome.status <= 299) {
    if (outcome.receipt === undefined) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
    const kind = outcome.receiptKind ?? context.receiptKind;
    if (!isReceiptKind(kind)) return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
    try {
      const receipt = createOfflineReceiptRecord(
        kind,
        outcome.receipt,
        context.instanceId,
        context.attemptId,
      );
      return { kind: "accepted", receipt };
    } catch {
      return { kind: "blocked", reason: "incomplete-authoritative-receipt" };
    }
  }

  return { kind: "blocked", reason: "malformed-response" };
}

/** A pure, fail-closed outbox transition function. */
export function transitionOfflineAttempt(
  record: OfflineAttemptRecord,
  event: OfflineAttemptEvent,
): OfflineAttemptRecord {
  if (record.status === "draft") {
    if (event.type !== "confirm-submission") throw new Error(`Invalid transition draft -> ${event.type}`);
    return confirmOfflineSubmission(record, event.submission);
  }

  switch (record.status) {
    case "pending":
      if (event.type === "begin-send") return deepFreeze({ ...record, status: "sending" as const });
      throw new Error(`Invalid transition pending -> ${event.type}`);
    case "sending":
      if (event.type === "retryable-failure" || event.type === "crash-recovered") {
        return deepFreeze({ ...record, status: "pending" as const });
      }
      if (event.type === "auth-required") return deepFreeze({ ...record, status: "auth-required" as const });
      if (event.type === "accepted") {
        const restored = authoritativeReceiptResult(event.receipt, record.submission.instanceId);
        if (restored.attemptId !== record.submission.attemptId) {
          throw new Error("stored receipt attemptId does not match the outbox submission");
        }
        return deepFreeze({
          ...record,
          status: restored.srsApplied ? "accepted-applied" as const : "accepted-no-srs" as const,
          receipt: event.receipt,
          blockedReason: null,
        });
      }
      if (event.type === "blocked") {
        return deepFreeze({ ...record, status: "blocked" as const, blockedReason: event.reason });
      }
      throw new Error(`Invalid transition sending -> ${event.type}`);
    case "auth-required":
      if (event.type === "reauthenticated") return deepFreeze({ ...record, status: "pending" as const });
      throw new Error(`Invalid transition auth-required -> ${event.type}`);
    case "accepted-applied":
    case "accepted-no-srs":
    case "blocked":
      throw new Error(`Terminal outbox state cannot transition: ${record.status} -> ${event.type}`);
  }
}

/** Apply a server classification to an in-flight record without changing its submission. */
export function transitionFromDelivery(
  record: OfflineAttemptCommitted,
  classification: OfflineDeliveryClassification,
): OfflineAttemptCommitted {
  if (record.status !== "sending") throw new Error("Only a sending attempt can consume a delivery result");
  switch (classification.kind) {
    case "retryable":
      return transitionOfflineAttempt(record, { type: "retryable-failure", reason: classification.reason }) as OfflineAttemptCommitted;
    case "auth-required":
      return transitionOfflineAttempt(record, { type: "auth-required" }) as OfflineAttemptCommitted;
    case "receipt-lookup-required":
      // Lookup is a transport follow-up, not an outbox state. Keep the
      // in-flight submission non-terminal until that lookup classifies it.
      return record;
    case "accepted": {
      return transitionOfflineAttempt(record, {
        type: "accepted",
        receipt: classification.receipt,
      }) as OfflineAttemptCommitted;
    }
    case "blocked":
      return transitionOfflineAttempt(record, { type: "blocked", reason: classification.reason }) as OfflineAttemptCommitted;
  }
}

export { createOfflineAttemptDraft, confirmOfflineSubmission };

export type {
  OfflineAttemptCommitted,
  OfflineAttemptDraft,
  OfflineAttemptRecord,
  OfflineAttemptStatus,
  OfflineBlockedReason,
  OfflineReceiptKind,
  OfflineReceiptRecord,
  OfflineSubmission,
  OfflineSubmissionInput,
} from "./model.ts";
