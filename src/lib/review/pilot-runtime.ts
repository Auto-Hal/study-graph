import "server-only";

import { getKuzushijiDashboard, type Character, type ReviewItem } from "@/src/lib/notion/kuzushiji";
import { buildKuzushijiScopeSnapshot, type ScopeDecision, type ScopeSnapshot } from "@/src/lib/review/scope";
import { hashExerciseAttemptRequest, gradeExerciseRevision, planLegacySrs, type ExerciseAttemptRequest, type ReviewGrade } from "@/src/lib/review/exercises/attempt";
import { createPilotPresentation, hashPilotPresentation, type PilotPresentation } from "@/src/lib/review/exercises/attempt";
import { KUZUSHIJI_PILOT_EXERCISE_ID } from "@/src/lib/review/exercises/kuzushiji-pilot";
import { kuzushijiPilotRevision, kuzushijiPilotRevisionPayload } from "@/src/lib/review/exercises/kuzushiji-revision";
import {
  ensureKuzushijiPilotArchive,
  getKuzushijiPilotAttemptReceipt,
  getPilotRuntimeConfig,
  issueKuzushijiPilotInstance,
  PilotRpcError,
  recordKuzushijiPilotAttempt,
  resolveKuzushijiPilotInstance,
} from "@/src/lib/supabase/pilot";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PilotScopeEvidence = {
  policyVersion: ScopeSnapshot["policyVersion"];
  evaluatedAt: string;
  sourceState: ScopeSnapshot["sourceState"];
  characterId: string;
  decision: ScopeDecision | null;
};

export function isKuzushijiPilotDefinition(definitionId: string | undefined) {
  return definitionId === KUZUSHIJI_PILOT_EXERCISE_ID;
}

export function buildPilotScopeEvidence(scope: ScopeSnapshot, characterId: string): PilotScopeEvidence {
  return {
    policyVersion: scope.policyVersion,
    evaluatedAt: scope.evaluatedAt,
    sourceState: scope.sourceState,
    characterId,
    decision: scope.decisions[characterId] ?? null,
  };
}

export function isPilotScopeEligible(scope: ScopeSnapshot, characterId: string) {
  return scope.sourceState === "ready" && scope.decisions[characterId]?.status === "eligible";
}

export function createPilotPresentationForRevision() {
  return createPilotPresentation(kuzushijiPilotRevisionPayload);
}

export function validatePilotAttemptInput(value: unknown): { ok: true; request: ExerciseAttemptRequest } | { ok: false; error: string } {
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
  if (body.selfEvaluation !== null && body.selfEvaluation !== undefined
    && !["again", "hard", "good", "easy"].includes(String(body.selfEvaluation))) {
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
      selfEvaluation: (body.selfEvaluation ?? null) as ReviewGrade | null,
      responseMs: (body.responseMs ?? null) as number | null,
      usedHint: body.usedHint,
    },
  };
}

export async function issueKuzushijiPilotReview(input: {
  character: Character;
  item: ReviewItem;
  scope: ScopeSnapshot;
  legacyExerciseId: string;
}) {
  if (!getPilotRuntimeConfig()) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  if (!isPilotScopeEligible(input.scope, input.character.id)) {
    throw new PilotRpcError("pilot_scope_not_eligible", 409, "pilot_scope_not_eligible");
  }
  if (kuzushijiPilotRevision.status === "draft" || kuzushijiPilotRevision.status === "retired") {
    throw new PilotRpcError("revision_not_issuable", 409, "revision_not_issuable");
  }
  const archive = await ensureKuzushijiPilotArchive();
  const presentation = createPilotPresentationForRevision();
  const issue = await issueKuzushijiPilotInstance({
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    presentation: presentation as unknown as Record<string, unknown>,
    presentationHash: hashPilotPresentation(presentation),
    scopeEvidence: buildPilotScopeEvidence(input.scope, input.character.id) as unknown as Record<string, unknown>,
    legacyItemId: input.character.id,
    legacyExerciseId: input.legacyExerciseId,
  });
  return { ...issue, presentation };
}

function receiptField<T>(receipt: Record<string, unknown>, key: string, fallback: T) {
  return (receipt[key] as T | undefined) ?? fallback;
}

export type PilotAttemptResult = {
  saved: true;
  attemptId: string;
  instanceId: string;
  gradingStatus: "graded" | "ungraded";
  isCorrect: boolean | null;
  normalizedAnswer: string | null;
  effectiveSrsGrade: ReviewGrade | null;
  srsApplied: boolean;
  srsReason: string;
  dueAt: string | null;
  receipt: Record<string, unknown>;
};

export async function submitKuzushijiPilotAttempt(request: ExerciseAttemptRequest): Promise<PilotAttemptResult> {
  if (!getPilotRuntimeConfig()) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const instance = await resolveKuzushijiPilotInstance(request.instanceId);
  if (instance.project_id !== "kuzushiji" || instance.exercise_id !== KUZUSHIJI_PILOT_EXERCISE_ID) {
    throw new PilotRpcError("unsupported_pilot_instance", 409, "unsupported_pilot_instance");
  }

  const grading = gradeExerciseRevision(instance.revision_payload, request.rawAnswer);
  const data = await getKuzushijiDashboard();
  const currentScope = buildKuzushijiScopeSnapshot(data);
  const currentDecision = data.mode === "notion" && currentScope.sourceState === "ready"
    ? currentScope.decisions[instance.legacy_item_id]
    : undefined;
  const scopeAccepted = currentDecision?.status === "eligible";
  const revisionStatus = instance.revision_status;
  const srsPlan = planLegacySrs({
    gradingStatus: grading.gradingStatus,
    scopeAccepted: revisionStatus === "retired" || revisionStatus === "draft" ? false : scopeAccepted,
    revisionStatus,
  });
  const requestHash = hashExerciseAttemptRequest(request);

  try {
    const receipt = await recordKuzushijiPilotAttempt({
      request,
      requestHash,
      grading,
      selfEvaluation: request.selfEvaluation,
      scopeAccepted,
      srsPlan,
    });
    const reviewStateAfter = receiptField<Record<string, unknown> | null>(receipt, "reviewStateAfter", null);
    return {
      saved: true,
      attemptId: request.attemptId,
      instanceId: request.instanceId,
      gradingStatus: receiptField(receipt, "gradingStatus", grading.gradingStatus),
      isCorrect: receiptField(receipt, "isCorrect", grading.isCorrect),
      normalizedAnswer: grading.normalizedAnswer,
      effectiveSrsGrade: receiptField(receipt, "effectiveSrsGrade", request.selfEvaluation),
      srsApplied: receiptField(receipt, "srsApplied", srsPlan.srsApplied),
      srsReason: receiptField(receipt, "srsReason", srsPlan.reason),
      dueAt: reviewStateAfter && typeof reviewStateAfter.due_at === "string" ? reviewStateAfter.due_at : null,
      receipt,
    };
  } catch (error) {
    if (error instanceof PilotRpcError && error.code === "instance_already_answered") {
      const stored = await getKuzushijiPilotAttemptReceipt(request.instanceId);
      if (stored) {
        const receipt = stored.receipt;
        const reviewStateAfter = receiptField<Record<string, unknown> | null>(receipt, "reviewStateAfter", null);
        return {
          saved: true,
          attemptId: stored.attempt_id,
          instanceId: request.instanceId,
          gradingStatus: receiptField(receipt, "gradingStatus", grading.gradingStatus),
          isCorrect: receiptField(receipt, "isCorrect", grading.isCorrect),
          normalizedAnswer: grading.normalizedAnswer,
          effectiveSrsGrade: receiptField(receipt, "effectiveSrsGrade", null),
          srsApplied: receiptField(receipt, "srsApplied", false),
          srsReason: receiptField(receipt, "srsReason", "scope-not-eligible"),
          dueAt: reviewStateAfter && typeof reviewStateAfter.due_at === "string" ? reviewStateAfter.due_at : null,
          receipt,
        };
      }
    }
    throw error;
  }
}
