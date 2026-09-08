import type { ExerciseAttemptRequest, ReviewGrade } from "./exercises/attempt";

/** The only validation errors exposed by the pilot attempt boundary. */
export type PilotAttemptValidationErrorCode =
  | "invalid_body"
  | "invalid_attempt_id"
  | "invalid_instance_id"
  | "invalid_raw_answer"
  | "raw_answer_too_large"
  | "invalid_self_evaluation"
  | "invalid_response_ms"
  | "invalid_used_hint";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate the exact six-field pilot wire tuple without touching runtime,
 * grading, Supabase, Scope, or SRS. This module is shared by the submission
 * route and the explicit, read-only diagnostics route.
 */
export function validatePilotAttemptInput(value: unknown):
  | { ok: true; request: ExerciseAttemptRequest }
  | { ok: false; error: PilotAttemptValidationErrorCode } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_body" };
  const body = value as Record<string, unknown>;
  if (typeof body.attemptId !== "string" || !UUID_PATTERN.test(body.attemptId)) return { ok: false, error: "invalid_attempt_id" };
  if (typeof body.instanceId !== "string" || !UUID_PATTERN.test(body.instanceId)) return { ok: false, error: "invalid_instance_id" };
  const rawAnswer = body.rawAnswer;
  if (
    typeof rawAnswer !== "string"
    && !(rawAnswer && typeof rawAnswer === "object" && !Array.isArray(rawAnswer)
      && (rawAnswer as Record<string, unknown>).type === "text"
      && typeof (rawAnswer as Record<string, unknown>).value === "string")
  ) return { ok: false, error: "invalid_raw_answer" };
  const rawText = typeof rawAnswer === "string" ? rawAnswer : (rawAnswer as Record<string, unknown>).value as string;
  if (rawText.length > 2_000) return { ok: false, error: "raw_answer_too_large" };
  if (typeof body.selfEvaluation !== "string" || !["again", "hard", "good", "easy"].includes(body.selfEvaluation)) {
    return { ok: false, error: "invalid_self_evaluation" };
  }
  if (body.responseMs !== null && body.responseMs !== undefined
    && (typeof body.responseMs !== "number" || !Number.isInteger(body.responseMs) || body.responseMs < 0 || body.responseMs > 3_600_000)) {
    return { ok: false, error: "invalid_response_ms" };
  }
  if (typeof body.usedHint !== "boolean") return { ok: false, error: "invalid_used_hint" };
  return {
    ok: true,
    request: {
      attemptId: body.attemptId,
      instanceId: body.instanceId,
      rawAnswer: rawAnswer as ExerciseAttemptRequest["rawAnswer"],
      selfEvaluation: body.selfEvaluation as ReviewGrade,
      responseMs: (body.responseMs ?? null) as number | null,
      usedHint: body.usedHint,
    },
  };
}

