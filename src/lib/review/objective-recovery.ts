import {
  assertValidObjectiveSchedulingContextV1,
  type ObjectiveSchedulingContextV1,
} from "./objective-opportunity.ts";
import type { ObjectiveSrsApplicationReasonV2 } from "./objective-srs.ts";
import {
  resultFromStoredObjectiveReceipt,
  StoredReceiptIncompleteError,
  type StoredPilotReceiptResult,
} from "./exercises/receipt.ts";
import type { ReviewGrade } from "./exercises/attempt.ts";

/**
 * A browser-safe view of an accepted Objective receipt. It contains only
 * fields copied from the stored receipt; it never consults current state,
 * grading, Scope, or opportunity rows.
 */
export type ObjectiveRecoveryReceipt = Readonly<{
  receiptVersion: 1 | 2;
  attemptId: string;
  instanceId: string;
  acceptedAt: string;
  gradingStatus: "graded" | "ungraded";
  isCorrect: boolean | null;
  applied: boolean;
  reason: ObjectiveSrsApplicationReasonV2;
  effectiveGrade: ReviewGrade | null;
  stateRevision: number | null;
  dueAt: string | null;
}>;

export type ObjectiveRecoveryOutcome = Readonly<{
  kind: "accepted-applied" | "accepted-no-srs";
  terminal: true;
  receipt: ObjectiveRecoveryReceipt;
}>;

export type HistoricalObjectiveContext = Readonly<{
  kind: "historical-v1";
  schedulingContext: null;
  expectedStateRevision: null;
  srsAuthority: "none";
}>;

export type VersionedObjectiveContext = Readonly<{
  kind: "v2";
  schedulingContext: ObjectiveSchedulingContextV1;
  expectedStateRevision: number | null;
  srsAuthority: "pinned" | "practice-only";
}>;

export type ObjectiveSchedulingContextRead = HistoricalObjectiveContext | VersionedObjectiveContext;

export type ObjectiveOpportunityLifecycle = Readonly<{
  opportunityId: string;
  instanceId: string;
  status: "active" | "terminal";
  terminalReason: "accepted" | "accepted-no-srs" | "expired" | "stale" | null;
}>;

export class ObjectiveRecoveryContractError extends Error {
  readonly code:
    | "malformed-objective-receipt"
    | "malformed-scheduling-context"
    | "malformed-opportunity-lifecycle";

  constructor(code: ObjectiveRecoveryContractError["code"], message: string) {
    super(message);
    this.name = "ObjectiveRecoveryContractError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Restore an Objective receipt for reload/retry without reconstructing it.
 * Stored Receipt fields are the only source of the returned result.
 */
export function restoreObjectiveReceiptForRecovery(
  receipt: unknown,
  instanceId: string,
): ObjectiveRecoveryReceipt {
  let restored: StoredPilotReceiptResult;
  try {
    restored = resultFromStoredObjectiveReceipt(receipt, instanceId);
  } catch (error) {
    if (error instanceof StoredReceiptIncompleteError) {
      throw new ObjectiveRecoveryContractError(
        "malformed-objective-receipt",
        "The stored Objective receipt cannot be restored safely",
      );
    }
    throw error;
  }

  const stored = restored.receipt;
  if (!isRecord(stored) || (stored.receiptVersion !== 1 && stored.receiptVersion !== 2)) {
    throw new ObjectiveRecoveryContractError(
      "malformed-objective-receipt",
      "The stored Objective receipt version is unsupported",
    );
  }

  return Object.freeze({
    receiptVersion: stored.receiptVersion,
    attemptId: restored.attemptId,
    instanceId: restored.instanceId,
    acceptedAt: stored.acceptedAt as string,
    gradingStatus: restored.gradingStatus,
    isCorrect: restored.isCorrect,
    applied: restored.srsApplied,
    reason: restored.srsReason,
    effectiveGrade: restored.effectiveSrsGrade,
    stateRevision: typeof stored.stateRevision === "number" ? stored.stateRevision : null,
    dueAt: restored.dueAt,
  });
}

/** Restore the objective entry from the unchanged descriptor-v1 offline wrapper. */
export function restoreObjectiveOfflineReceiptForRecovery(
  record: unknown,
  instanceId: string,
): ObjectiveRecoveryReceipt {
  if (!isRecord(record)
    || record.descriptorVersion !== 1
    || record.kind !== "objective"
    || !Object.prototype.hasOwnProperty.call(record, "receipt")) {
    throw new ObjectiveRecoveryContractError(
      "malformed-objective-receipt",
      "The offline Objective receipt descriptor is unsupported",
    );
  }
  return restoreObjectiveReceiptForRecovery(record.receipt, instanceId);
}

/**
 * Accepted no-SRS is terminal. This function deliberately has no current
 * state/opportunity parameter, so recovery cannot retroactively apply it.
 */
export function recoverObjectiveReceipt(
  receipt: unknown,
  instanceId: string,
): ObjectiveRecoveryOutcome {
  const normalized = restoreObjectiveReceiptForRecovery(receipt, instanceId);
  return Object.freeze({
    kind: normalized.applied ? "accepted-applied" : "accepted-no-srs",
    terminal: true as const,
    receipt: normalized,
  });
}

const SCHEDULING_FIELDS = [
  "schedulingContextVersion",
  "opportunityKind",
  "effectiveEvidenceUse",
  "expectedStateRevision",
  "gradePolicyVersion",
  "activationPolicyVersion",
  "issuedAt",
  "expiresAt",
  "dueAtObserved",
] as const;

const SCHEDULING_CONTEXT_COLUMNS = [
  "schedulingContextVersion",
  "opportunityKind",
  "expectedStateRevision",
  "gradePolicyVersion",
  "activationPolicyVersion",
  "issuedAt",
  "expiresAt",
  "dueAtObserved",
] as const;

/**
 * Read the nullable scheduling columns without inferring missing data. Every
 * field must be explicitly present: all-null is a proven historical v1 row,
 * while an omitted field is an unknown/malformed read and fails closed.
 */
export function readObjectiveSchedulingContext(value: unknown): ObjectiveSchedulingContextRead {
  if (!isRecord(value)
    || Object.keys(value).some((field) => !SCHEDULING_FIELDS.includes(field as typeof SCHEDULING_FIELDS[number]))
    || SCHEDULING_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(value, field))) {
    throw new ObjectiveRecoveryContractError(
      "malformed-scheduling-context",
      "Objective scheduling context is incomplete",
    );
  }

  if (SCHEDULING_CONTEXT_COLUMNS.every((field) => value[field] === null)
    && (value.effectiveEvidenceUse === null
      || value.effectiveEvidenceUse === "srs"
      || value.effectiveEvidenceUse === "practice-only")) {
    return Object.freeze({
      kind: "historical-v1" as const,
      schedulingContext: null,
      expectedStateRevision: null,
      srsAuthority: "none" as const,
    });
  }

  if (value.schedulingContextVersion !== 1) {
    throw new ObjectiveRecoveryContractError(
      "malformed-scheduling-context",
      "Objective scheduling context version is unsupported",
    );
  }

  try {
    assertValidObjectiveSchedulingContextV1({
      contractVersion: value.schedulingContextVersion,
      opportunityKind: value.opportunityKind,
      effectiveEvidenceUse: value.effectiveEvidenceUse,
      expectedStateRevision: value.expectedStateRevision,
      gradePolicyVersion: value.gradePolicyVersion,
      activationPolicyVersion: value.activationPolicyVersion,
      issuedAt: value.issuedAt,
      expiresAt: value.expiresAt,
      dueAtObserved: value.dueAtObserved,
    });
  } catch {
    throw new ObjectiveRecoveryContractError(
      "malformed-scheduling-context",
      "Objective scheduling context is invalid",
    );
  }

  const schedulingContext = Object.freeze({
    contractVersion: value.schedulingContextVersion,
    opportunityKind: value.opportunityKind,
    effectiveEvidenceUse: value.effectiveEvidenceUse,
    expectedStateRevision: value.expectedStateRevision,
    gradePolicyVersion: value.gradePolicyVersion,
    activationPolicyVersion: value.activationPolicyVersion,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    dueAtObserved: value.dueAtObserved,
  }) as ObjectiveSchedulingContextV1;
  return Object.freeze({
    kind: "v2" as const,
    schedulingContext,
    expectedStateRevision: schedulingContext.expectedStateRevision,
    srsAuthority: schedulingContext.effectiveEvidenceUse === "practice-only" ? "practice-only" as const : "pinned" as const,
  });
}

const TERMINAL_REASONS = new Set(["accepted", "accepted-no-srs", "expired", "stale"]);

/** Read opportunity lifecycle facts without treating terminal rows as active. */
export function readObjectiveOpportunityLifecycle(value: unknown): ObjectiveOpportunityLifecycle {
  if (!isRecord(value)
    || Object.keys(value).some((field) => !["opportunityId", "instanceId", "status", "terminalReason"].includes(field))
    || !isNonEmptyString(value.opportunityId)
    || !isNonEmptyString(value.instanceId)
    || (value.status !== "active" && value.status !== "terminal")) {
    throw new ObjectiveRecoveryContractError(
      "malformed-opportunity-lifecycle",
      "Objective opportunity lifecycle is invalid",
    );
  }
  if (value.status === "active" && value.terminalReason !== null) {
    throw new ObjectiveRecoveryContractError(
      "malformed-opportunity-lifecycle",
      "Active Objective opportunities cannot have a terminal reason",
    );
  }
  if (value.status === "terminal" && !TERMINAL_REASONS.has(value.terminalReason as string)) {
    throw new ObjectiveRecoveryContractError(
      "malformed-opportunity-lifecycle",
      "Terminal Objective opportunities require a known terminal reason",
    );
  }
  return Object.freeze({
    opportunityId: value.opportunityId,
    instanceId: value.instanceId,
    status: value.status,
    terminalReason: value.terminalReason as ObjectiveOpportunityLifecycle["terminalReason"],
  });
}

/** A replacement opportunity cannot be adopted for an old instance. */
export function opportunityOwnsActiveInstance(
  lifecycle: ObjectiveOpportunityLifecycle,
  instanceId: string,
): boolean {
  return lifecycle.status === "active" && lifecycle.instanceId === instanceId;
}

