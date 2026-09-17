import { calculateLegacySchedule, type LegacySchedule } from "./exercises/scheduler.ts";
import type { ReviewGrade } from "./exercises/attempt.ts";
import { canonicalizeJson } from "./canonical-json.ts";
import {
  assertValidSrsEpoch,
  isPositiveInteger,
  type SrsEpoch,
} from "./objective-validation.ts";

/** The Objective state key deliberately excludes objectiveVersion. */
export type ObjectiveSrsKey = {
  learnerId: string;
  projectId: string;
  objectiveId: string;
  srsEpoch: SrsEpoch;
};

export type ObjectiveSrsApplicationReason =
  | "applied"
  | "grader-unavailable"
  | "scope-not-eligible"
  | "revision-quarantined"
  | "revision-retired"
  | "practice-only"
  | "epoch-inactive";

/** Additive reason vocabulary reserved for the future Objective Receipt v2 writer. */
export type ObjectiveSrsApplicationReasonV2 = ObjectiveSrsApplicationReason
  | "stale-opportunity"
  | "issuance-context-missing";

export type ObjectiveReviewState = {
  learnerId: string;
  projectId: string;
  objectiveId: string;
  srsEpoch: SrsEpoch;
  lastGrade: ReviewGrade;
  repetitions: number;
  intervalDays: number;
  lastReviewedAt: string;
  dueAt: string;
  schedulerVersion: string;
  stateRevision: number;
  lastApplicationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ObjectiveSrsReceipt = {
  receiptVersion: 1;
  attemptId: string;
  instanceId: string;
  projectId: string;
  objectiveId: string;
  objectiveVersion: number;
  srsEpoch: SrsEpoch;
  evidenceUse: "srs" | "practice-only";
  gradingStatus: "graded" | "ungraded";
  isCorrect: boolean | null;
  applied: boolean;
  reason: ObjectiveSrsApplicationReason;
  effectiveGrade: ReviewGrade | null;
  stateRevision: number | null;
  dueAt: string | null;
};

/** Future compact receipt shape. This type does not change the current v1 writer. */
export type ObjectiveSrsReceiptV2 = {
  receiptVersion: 2;
  attemptId: string;
  instanceId: string;
  acceptedAt: string;
  projectId: string;
  objectiveId: string;
  objectiveVersion: number;
  srsEpoch: SrsEpoch;
  evidenceUse: "srs" | "practice-only";
  gradingStatus: "graded" | "ungraded";
  isCorrect: boolean | null;
  applied: boolean;
  reason: ObjectiveSrsApplicationReasonV2;
  effectiveGrade: ReviewGrade | null;
  stateRevision: number | null;
  dueAt: string | null;
};

export type ObjectiveSrsApplication = {
  applicationId: string;
  attemptId: string;
  instanceId: string;
  learnerId: string;
  projectId: string;
  objectiveId: string;
  objectiveVersion: number;
  srsEpoch: SrsEpoch;
  evidenceUse: "srs" | "practice-only";
  applied: boolean;
  reason: ObjectiveSrsApplicationReason;
  effectiveGrade: ReviewGrade | null;
  schedulerVersion: string | null;
  stateBefore: ObjectiveReviewState | null;
  stateAfter: ObjectiveReviewState | null;
  receipt: ObjectiveSrsReceipt;
  createdAt: string;
};

const APPLICATION_REASONS: readonly ObjectiveSrsApplicationReason[] = [
  "applied",
  "grader-unavailable",
  "scope-not-eligible",
  "revision-quarantined",
  "revision-retired",
  "practice-only",
  "epoch-inactive",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate the four-part Objective state key without introducing a hierarchy. */
export function validateObjectiveSrsKey(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["objective SRS key must be an object"];
  }
  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of ["learnerId", "projectId", "objectiveId"]) {
    if (!isNonEmptyString(candidate[field])) errors.push(`${field} is required`);
  }
  if (!isPositiveInteger(candidate.srsEpoch)) errors.push("srsEpoch must be a positive integer");
  return errors;
}

export function assertValidObjectiveSrsKey(value: unknown): asserts value is ObjectiveSrsKey {
  const errors = validateObjectiveSrsKey(value);
  if (errors.length > 0) throw new Error("Invalid objective SRS key: " + errors.join("; "));
}

/**
 * A canonical tuple makes the state key deterministic and keeps
 * objectiveVersion out of SRS identity by construction.
 */
export function objectiveSrsKey(value: ObjectiveSrsKey): string {
  assertValidObjectiveSrsKey(value);
  return canonicalizeJson([value.learnerId, value.projectId, value.objectiveId, value.srsEpoch]);
}

export function isObjectiveSrsApplicationReason(value: unknown): value is ObjectiveSrsApplicationReason {
  return APPLICATION_REASONS.includes(value as ObjectiveSrsApplicationReason);
}

export function assertValidObjectiveSrsApplicationReason(
  value: unknown,
): asserts value is ObjectiveSrsApplicationReason {
  if (!isObjectiveSrsApplicationReason(value)) {
    throw new Error("Invalid Objective SRS application reason");
  }
}

/** Reuse the legacy four-grade arithmetic until a later scheduler decision. */
export function calculateObjectiveSchedule(
  grade: ReviewGrade,
  previousIntervalDays: number,
  previousRepetitions: number,
  now: Date,
): LegacySchedule {
  return calculateLegacySchedule(grade, previousIntervalDays, previousRepetitions, now);
}

export function assertValidObjectiveSrsEpoch(value: unknown): asserts value is SrsEpoch {
  assertValidSrsEpoch(value);
}
