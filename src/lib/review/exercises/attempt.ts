import { canonicalizeJson, sha256Hex, type ExerciseRevisionPayload, type JsonValue } from "./revision.ts";
import { canonicalizeExerciseAttemptRequest as canonicalizeAttemptContent } from "./attempt-content.ts";
import type { ExerciseAttemptHashInput } from "./attempt-content.ts";
import type { ExerciseStatus } from "./types.ts";
import { calculateLegacySchedule } from "./scheduler.ts";
import type { LegacySchedule as SharedLegacySchedule } from "./scheduler.ts";

export { canonicalizeExerciseAttemptRequest } from "./attempt-content.ts";

export type PilotPresentation = {
  prompt: string;
  front: string;
  asset: {
    assetId: string;
    assetVersion: number;
    mediaType: string;
    src: string;
    width: number;
    height: number;
    alt: string;
    checksum: string | null;
    source: {
      title: string;
      image?: string;
      url: string;
      attribution: string;
      license: string;
    };
  };
};

/** Build the exact answer-free presentation persisted on a pilot instance. */
export function createPilotPresentation(revision: ExerciseRevisionPayload): PilotPresentation {
  const asset = revision.visualAssets[0];
  if (!asset) throw new Error("Pilot revision has no visual asset");
  return {
    prompt: revision.prompt,
    front: revision.front,
    asset: {
      assetId: asset.assetId,
      assetVersion: asset.assetVersion,
      mediaType: asset.mediaType,
      src: asset.src,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
      checksum: asset.checksum,
      source: {
        title: asset.source.title,
        ...(asset.source.image === undefined ? {} : { image: asset.source.image }),
        url: asset.source.url,
        attribution: asset.source.attribution,
        license: asset.source.license,
      },
    },
  };
}

export function hashPilotPresentation(presentation: PilotPresentation) {
  return sha256Hex(canonicalizeJson(presentation));
}

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
export function hashExerciseAttemptRequest(request: ExerciseAttemptRequest) {
  return sha256Hex(canonicalizeAttemptContent(request as ExerciseAttemptHashInput));
}

export type LegacySchedule = SharedLegacySchedule;
/** Exact arithmetic contract mirrored by public.study_graph_record_review. */
export { calculateLegacySchedule };

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
