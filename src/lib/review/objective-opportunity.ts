import type { ReviewGrade } from "./exercises/attempt.ts";

export const OBJECTIVE_OPPORTUNITY_CONTRACT_VERSION = 1 as const;
export const OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1 = "on-publication-v1" as const;
export const OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1 = "deterministic-correctness-cap-v1" as const;
export const OBJECTIVE_SRS_OPPORTUNITY_TTL_SECONDS = 604800 as const;

export type ObjectiveOpportunityKind = "unseen" | "due" | "practice";
export type ObjectiveEffectiveEvidenceUse = "srs" | "practice-only";

/** Immutable server issuance facts. Revision 0 means positively observed absent state; null is practice only. */
export type ObjectiveSchedulingContextV1 = Readonly<{
  contractVersion: typeof OBJECTIVE_OPPORTUNITY_CONTRACT_VERSION;
  opportunityKind: ObjectiveOpportunityKind;
  effectiveEvidenceUse: ObjectiveEffectiveEvidenceUse;
  expectedStateRevision: number | null;
  gradePolicyVersion: string;
  activationPolicyVersion: string;
  issuedAt: string;
  expiresAt: string | null;
  dueAtObserved?: string | null;
}>;

const CONTEXT_KEYS = new Set([
  "contractVersion",
  "opportunityKind",
  "effectiveEvidenceUse",
  "expectedStateRevision",
  "gradePolicyVersion",
  "activationPolicyVersion",
  "issuedAt",
  "expiresAt",
  "dueAtObserved",
]);
const POLICY_VERSION = /^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9][0-9]*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && second <= 59;
}

function isPolicyVersion(value: unknown): value is string {
  return typeof value === "string" && POLICY_VERSION.test(value);
}

/** Returns validation errors without consulting any runtime, persistence, or current scheduling authority. */
export function validateObjectiveSchedulingContextV1(value: unknown): string[] {
  if (!isRecord(value)) return ["scheduling context must be an object"];
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!CONTEXT_KEYS.has(key)) errors.push(`unknown scheduling context field: ${key}`);
  }
  for (const key of CONTEXT_KEYS) {
    if (key !== "dueAtObserved" && !Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${key} is required`);
    }
  }
  if (value.contractVersion !== OBJECTIVE_OPPORTUNITY_CONTRACT_VERSION) errors.push("contractVersion is unsupported");
  if (value.opportunityKind !== "unseen" && value.opportunityKind !== "due" && value.opportunityKind !== "practice") {
    errors.push("opportunityKind is invalid");
  }
  if (value.effectiveEvidenceUse !== "srs" && value.effectiveEvidenceUse !== "practice-only") {
    errors.push("effectiveEvidenceUse is invalid");
  }
  if (!isPolicyVersion(value.gradePolicyVersion)) errors.push("gradePolicyVersion is invalid");
  if (!isPolicyVersion(value.activationPolicyVersion)) errors.push("activationPolicyVersion is invalid");
  if (!isTimestamp(value.issuedAt)) errors.push("issuedAt is invalid");
  if (value.dueAtObserved !== undefined && value.dueAtObserved !== null && !isTimestamp(value.dueAtObserved)) {
    errors.push("dueAtObserved is invalid");
  }

  if (value.opportunityKind === "unseen") {
    if (value.effectiveEvidenceUse !== "srs") errors.push("unseen requires srs evidence");
    if (value.expectedStateRevision !== 0) errors.push("unseen requires expectedStateRevision 0");
    if (!isTimestamp(value.expiresAt)) errors.push("unseen requires a valid expiresAt");
  } else if (value.opportunityKind === "due") {
    if (value.effectiveEvidenceUse !== "srs") errors.push("due requires srs evidence");
    if (typeof value.expectedStateRevision !== "number" || !Number.isSafeInteger(value.expectedStateRevision) || value.expectedStateRevision <= 0) {
      errors.push("due requires a positive safe expectedStateRevision");
    }
    if (!isTimestamp(value.expiresAt)) errors.push("due requires a valid expiresAt");
  } else if (value.opportunityKind === "practice") {
    if (value.effectiveEvidenceUse !== "practice-only") errors.push("practice requires practice-only evidence");
    if (value.expectedStateRevision !== null) errors.push("practice requires a null expectedStateRevision");
    if (value.expiresAt !== null) errors.push("practice requires a null expiresAt");
  }
  if ((value.opportunityKind === "unseen" || value.opportunityKind === "due")
    && isTimestamp(value.issuedAt) && isTimestamp(value.expiresAt)
    && Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    errors.push("SRS opportunity expiry must follow issuedAt");
  }
  return errors;
}

export function assertValidObjectiveSchedulingContextV1(
  value: unknown,
): asserts value is ObjectiveSchedulingContextV1 {
  const errors = validateObjectiveSchedulingContextV1(value);
  if (errors.length > 0) throw new Error("Invalid Objective scheduling context: " + errors.join("; "));
}

/** Candidate grade for future deterministic Objective policies; current Kuzushiji runtime does not call this helper. */
export function deterministicObjectiveGradeV1(input: {
  gradingStatus: unknown;
  isCorrect: unknown;
  selfEvaluation: unknown;
}): ReviewGrade | null {
  const validGrade = (grade: unknown): grade is ReviewGrade =>
    grade === "again" || grade === "hard" || grade === "good" || grade === "easy";

  if (input.gradingStatus === "ungraded") {
    return null;
  }
  if (input.gradingStatus !== "graded" || typeof input.isCorrect !== "boolean") return null;
  if (input.selfEvaluation !== null && !validGrade(input.selfEvaluation)) return null;
  if (!input.isCorrect) return "again";
  return validGrade(input.selfEvaluation) ? input.selfEvaluation : null;
}
