import type { ReviewGrade } from "./attempt.ts";

export type PilotReceiptGradingStatus = "graded" | "ungraded";
export type PilotReceiptSrsReason = "applied" | "grader-unavailable" | "scope-not-eligible" | "revision-quarantined";

export type StoredPilotReceiptResult = {
  saved: true;
  attemptId: string;
  instanceId: string;
  gradingStatus: PilotReceiptGradingStatus;
  isCorrect: boolean | null;
  normalizedAnswer: null;
  effectiveSrsGrade: ReviewGrade | null;
  srsApplied: boolean;
  srsReason: PilotReceiptSrsReason;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(receipt: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(receipt, key);
}

/** Rebuild a response from an archived receipt only; never use the current submission as a fallback. */
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
