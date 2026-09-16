import type { ObjectiveSrsApplicationReason, ObjectiveSrsApplicationReasonV2 } from "../objective-srs.ts";
import type { ReviewGrade } from "./attempt.ts";

export type PilotReceiptGradingStatus = "graded" | "ungraded";
export type PilotReceiptSrsReason = "applied" | "grader-unavailable" | "scope-not-eligible" | "revision-quarantined";
export type StoredPilotSrsReason = PilotReceiptSrsReason | ObjectiveSrsApplicationReasonV2;

export type StoredPilotReceiptResult = {
  saved: true;
  attemptId: string;
  instanceId: string;
  gradingStatus: PilotReceiptGradingStatus;
  isCorrect: boolean | null;
  normalizedAnswer: null;
  effectiveSrsGrade: ReviewGrade | null;
  srsApplied: boolean;
  srsReason: StoredPilotSrsReason;
  dueAt: string | null;
  receipt: Record<string, unknown>;
};

export class StoredReceiptIncompleteError extends Error {
  readonly code = "stored_receipt_incomplete";

  constructor() {
    super("The stored attempt receipt does not contain the required authority fields");
    this.name = "StoredReceiptIncompleteError";
  }
}

const grades = new Set<ReviewGrade>(["again", "hard", "good", "easy"]);
const reasons = new Set<PilotReceiptSrsReason>(["applied", "grader-unavailable", "scope-not-eligible", "revision-quarantined"]);
const objectiveReasons = new Set<ObjectiveSrsApplicationReason>([
  "applied",
  "grader-unavailable",
  "scope-not-eligible",
  "revision-quarantined",
  "revision-retired",
  "practice-only",
  "epoch-inactive",
]);
const objectiveReasonsV2 = new Set<ObjectiveSrsApplicationReasonV2>([
  ...objectiveReasons,
  "stale-opportunity",
  "issuance-context-missing",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(receipt: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(receipt, key);
}

/** Rebuild a response from an archived legacy receipt only; never use the current submission as a fallback. */
export function resultFromStoredReceipt(receipt: unknown, instanceId: string): StoredPilotReceiptResult {
  if (!isRecord(receipt)) throw new StoredReceiptIncompleteError();
  const required = [
    "receiptVersion",
    "attemptId",
    "instanceId",
    "acceptedAt",
    "gradingStatus",
    "isCorrect",
    "effectiveSrsGrade",
    "srsApplied",
    "srsReason",
    "legacyReviewAttemptId",
    "reviewStateBefore",
    "reviewStateAfter",
  ];
  if (required.some((key) => !hasOwn(receipt, key))) throw new StoredReceiptIncompleteError();

  const gradingStatus = receipt.gradingStatus;
  const isCorrect = receipt.isCorrect;
  const effectiveSrsGrade = receipt.effectiveSrsGrade;
  const srsApplied = receipt.srsApplied;
  const srsReason = receipt.srsReason;
  if (
    receipt.receiptVersion !== 1
    || typeof receipt.attemptId !== "string"
    || receipt.instanceId !== instanceId
    || typeof receipt.acceptedAt !== "string"
    || (gradingStatus !== "graded" && gradingStatus !== "ungraded")
    || (gradingStatus === "graded" ? typeof isCorrect !== "boolean" : isCorrect !== null)
    || (effectiveSrsGrade !== null && !grades.has(effectiveSrsGrade as ReviewGrade))
    || typeof srsApplied !== "boolean"
    || typeof srsReason !== "string"
    || !reasons.has(srsReason as PilotReceiptSrsReason)
    || (srsApplied && (srsReason !== "applied" || effectiveSrsGrade === null))
    || (!srsApplied && srsReason === "applied")
    || (receipt.legacyReviewAttemptId !== null
      && (typeof receipt.legacyReviewAttemptId !== "number" || !Number.isSafeInteger(receipt.legacyReviewAttemptId)))
    || (receipt.reviewStateBefore !== null && !isRecord(receipt.reviewStateBefore))
    || (receipt.reviewStateAfter !== null && !isRecord(receipt.reviewStateAfter))
  ) throw new StoredReceiptIncompleteError();

  const reviewStateAfter = receipt.reviewStateAfter as Record<string, unknown> | null;
  return {
    saved: true,
    attemptId: receipt.attemptId,
    instanceId,
    gradingStatus: gradingStatus as PilotReceiptGradingStatus,
    isCorrect: isCorrect as boolean | null,
    normalizedAnswer: null,
    effectiveSrsGrade: effectiveSrsGrade as ReviewGrade | null,
    srsApplied,
    srsReason: srsReason as PilotReceiptSrsReason,
    dueAt: reviewStateAfter && typeof reviewStateAfter.due_at === "string" ? reviewStateAfter.due_at : null,
    receipt,
  };
}

/** Restore a stored Objective receipt without consulting current Scope, epoch, grading, or opportunity state. */
export function resultFromStoredObjectiveReceipt(receipt: unknown, instanceId: string): StoredPilotReceiptResult {
  if (!isRecord(receipt)) throw new StoredReceiptIncompleteError();
  const required = [
    "receiptVersion",
    "attemptId",
    "instanceId",
    "acceptedAt",
    "projectId",
    "objectiveId",
    "objectiveVersion",
    "srsEpoch",
    "evidenceUse",
    "gradingStatus",
    "isCorrect",
    "applied",
    "reason",
    "effectiveGrade",
    "stateRevision",
    "dueAt",
  ];
  if (required.some((key) => !hasOwn(receipt, key))) throw new StoredReceiptIncompleteError();

  const gradingStatus = receipt.gradingStatus;
  const isCorrect = receipt.isCorrect;
  const applied = receipt.applied;
  const reason = receipt.reason;
  const effectiveGrade = receipt.effectiveGrade;
  const stateRevision = receipt.stateRevision;
  const dueAt = receipt.dueAt;
  if (
    (receipt.receiptVersion !== 1 && receipt.receiptVersion !== 2)
    || typeof receipt.attemptId !== "string"
    || receipt.instanceId !== instanceId
    || typeof receipt.acceptedAt !== "string"
    || typeof receipt.projectId !== "string" || receipt.projectId.length === 0
    || typeof receipt.objectiveId !== "string" || receipt.objectiveId.length === 0
    || typeof receipt.objectiveVersion !== "number" || !Number.isSafeInteger(receipt.objectiveVersion) || receipt.objectiveVersion <= 0
    || typeof receipt.srsEpoch !== "number" || !Number.isSafeInteger(receipt.srsEpoch) || receipt.srsEpoch <= 0
    || (receipt.evidenceUse !== "srs" && receipt.evidenceUse !== "practice-only")
    || (gradingStatus !== "graded" && gradingStatus !== "ungraded")
    || (gradingStatus === "graded" ? typeof isCorrect !== "boolean" : isCorrect !== null)
    || typeof applied !== "boolean"
    || typeof reason !== "string"
    || (receipt.receiptVersion === 1
      ? !objectiveReasons.has(reason as ObjectiveSrsApplicationReason)
      : !objectiveReasonsV2.has(reason as ObjectiveSrsApplicationReasonV2))
    || (effectiveGrade !== null && !grades.has(effectiveGrade as ReviewGrade))
    || (applied && (reason !== "applied" || effectiveGrade === null
      || typeof stateRevision !== "number" || !Number.isSafeInteger(stateRevision) || stateRevision <= 0
      || typeof dueAt !== "string"))
    || (!applied && (reason === "applied" || effectiveGrade !== null || stateRevision !== null || dueAt !== null))
  ) throw new StoredReceiptIncompleteError();

  return {
    saved: true,
    attemptId: receipt.attemptId,
    instanceId,
    gradingStatus: gradingStatus as PilotReceiptGradingStatus,
    isCorrect: isCorrect as boolean | null,
    normalizedAnswer: null,
    effectiveSrsGrade: effectiveGrade as ReviewGrade | null,
    srsApplied: applied,
    srsReason: reason as ObjectiveSrsApplicationReasonV2,
    dueAt: dueAt as string | null,
    receipt,
  };
}
