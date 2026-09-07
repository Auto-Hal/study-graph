import { canonicalizeJson, sha256Hex, type ExerciseRevisionPayload, type JsonValue } from "./revision.ts";
import type { ExerciseStatus } from "./types.ts";

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export const LEGACY_TEXT_GRADING = {
  strategyId: "legacy-text-v1",
  strategyVersion: 1,
  normalizerVersion: "review-session-ja-v1",
} as const;

export type ExerciseGradingStatus = "graded" | "ungraded";

export type ExerciseGradingResult = {
  gradingStatus: ExerciseGradingStatus;
  normalizedAnswer: string | null;
  isCorrect: boolean | null;
  gradingAuthority: "server";
  gradingStrategyId: string;
  gradingStrategyVersion: number;
  normalizerVersion: string;
};

export type LegacyTextRawAnswer = string | { type: "text"; value: string };

/** Keep the Phase 3/4A ReviewSession normalization contract unchanged. */
export function normalizeLegacyTextV1(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s　]+/g, "")
    .replace(/[。．.!！?？、,，・「」『』（）()]/g, "");
}

function ungradedResult(revision: ExerciseRevisionPayload): ExerciseGradingResult {
  return {
    gradingStatus: "ungraded",
    normalizedAnswer: null,
    isCorrect: null,
    gradingAuthority: "server",
    gradingStrategyId: revision.gradingSpec.strategyId,
    gradingStrategyVersion: revision.gradingSpec.strategyVersion,
    normalizerVersion: revision.gradingSpec.normalization,
  };
}

function rawText(value: JsonValue): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as { type?: unknown; value?: unknown };
    if (candidate.type === "text" && typeof candidate.value === "string") return candidate.value;
  }
  return null;
}

/** Grade only an allowlisted pure strategy against archived revision data. */
export function gradeExerciseRevision(
  revision: ExerciseRevisionPayload,
  answer: JsonValue,
): ExerciseGradingResult {
  const strategy = revision.gradingSpec;
  if (
    strategy.strategyId !== LEGACY_TEXT_GRADING.strategyId
    || strategy.strategyVersion !== LEGACY_TEXT_GRADING.strategyVersion
    || strategy.normalization !== LEGACY_TEXT_GRADING.normalizerVersion
    || revision.answerSpec.type !== "text"
  ) {
    return ungradedResult(revision);
  }

  const text = rawText(answer);
  if (text === null) return ungradedResult(revision);

  const normalizedAnswer = normalizeLegacyTextV1(text);
  const isCorrect = revision.answerSpec.acceptedAnswers
    .some((candidate) => normalizeLegacyTextV1(candidate) === normalizedAnswer);

  return {
    gradingStatus: "graded",
    normalizedAnswer,
    isCorrect,
    gradingAuthority: "server",
    gradingStrategyId: strategy.strategyId,
    gradingStrategyVersion: strategy.strategyVersion,
    normalizerVersion: strategy.normalization,
  };
}

export type ExerciseAttemptRequest = {
  attemptId: string;
  instanceId: string;
  rawAnswer: JsonValue;
  selfEvaluation: ReviewGrade | null;
  responseMs: number | null;
  usedHint: boolean;
  /** Accepted for callers that carry transport timestamps; intentionally ignored. */
  submittedAt?: string;
  clientTimestamp?: string;
};

/** Hash only the immutable submission fields; timestamps are deliberately excluded. */
export function canonicalizeExerciseAttemptRequest(request: ExerciseAttemptRequest) {
  return canonicalizeJson({
    attemptId: request.attemptId,
    instanceId: request.instanceId,
    rawAnswer: request.rawAnswer,
    selfEvaluation: request.selfEvaluation,
    responseMs: request.responseMs,
    usedHint: request.usedHint,
  });
}

export function hashExerciseAttemptRequest(request: ExerciseAttemptRequest) {
  return sha256Hex(canonicalizeExerciseAttemptRequest(request));
}

export type LegacySchedule = {
  intervalDays: number;
  repetitions: number;
  dueAt: string;
};

/** Exact arithmetic contract mirrored by public.study_graph_record_review. */
export function calculateLegacySchedule(
  grade: ReviewGrade,
  previousIntervalDays: number,
  previousRepetitions: number,
  now: Date,
): LegacySchedule {
  const interval = Math.max(0, Math.trunc(previousIntervalDays));
  const repetitions = Math.max(0, Math.trunc(previousRepetitions));

  if (grade === "again") {
    return {
      intervalDays: 0,
      repetitions: 0,
      dueAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    };
  }

  const intervalDays = grade === "hard"
    ? interval === 0 ? 1 : Math.max(1, Math.ceil(interval * 1.2))
    : grade === "good"
      ? interval === 0 ? 2 : Math.max(2, Math.round(interval * 2.2))
      : interval === 0 ? 5 : Math.max(5, Math.round(interval * 3.2));

  return {
    intervalDays,
    repetitions: repetitions + 1,
    dueAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export type SrsPlanReason =
  | "applied"
  | "grader-unavailable"
  | "scope-not-eligible"
  | "revision-quarantined";

export type LegacySrsPlan = {
  srsApplied: boolean;
  reason: SrsPlanReason;
};

export function planLegacySrs(input: {
  gradingStatus: ExerciseGradingStatus;
  scopeAccepted: boolean;
  revisionStatus: ExerciseStatus;
}): LegacySrsPlan {
  if (input.revisionStatus === "quarantined") {
    return { srsApplied: false, reason: "revision-quarantined" };
  }
  if (!input.scopeAccepted) {
    return { srsApplied: false, reason: "scope-not-eligible" };
  }
  if (input.gradingStatus !== "graded") {
    return { srsApplied: false, reason: "grader-unavailable" };
  }
  return { srsApplied: true, reason: "applied" };
}
