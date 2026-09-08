import { canonicalizeJson, type JsonValue } from "../canonical-json.ts";

/** Runtime-neutral immutable request tuple shared by server and browser. */
export type ExerciseAttemptHashInput = Readonly<{
  attemptId: string;
  instanceId: string;
  rawAnswer: JsonValue;
  selfEvaluation: "again" | "hard" | "good" | "easy" | null;
  responseMs: number | null;
  usedHint: boolean;
  /** Accepted for compatibility, but deliberately excluded from the hash. */
  submittedAt?: string;
  clientTimestamp?: string;
}>;

/**
 * Canonical request bytes for the Phase 4C/4E contract. Transport timestamps,
 * snapshot claims, and retry metadata are deliberately outside this tuple.
 */
export function canonicalizeExerciseAttemptRequest(request: ExerciseAttemptHashInput) {
  return canonicalizeJson({
    attemptId: request.attemptId,
    instanceId: request.instanceId,
    rawAnswer: request.rawAnswer,
    selfEvaluation: request.selfEvaluation,
    responseMs: request.responseMs,
    usedHint: request.usedHint,
  });
}
