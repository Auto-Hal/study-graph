import "server-only";

import { getKuzushijiDashboard, type Character, type ReviewItem } from "@/src/lib/notion/kuzushiji";
import { buildKuzushijiScopeSnapshot, type ScopeDecision, type ScopeSnapshot } from "@/src/lib/review/scope";
import { hashExerciseAttemptRequest, gradeExerciseRevision, planLegacySrs, type ExerciseAttemptRequest, type ReviewGrade } from "@/src/lib/review/exercises/attempt";
import { createPilotPresentation, hashPilotPresentation, type PilotPresentation } from "@/src/lib/review/exercises/attempt";
import { resultFromStoredObjectiveReceipt, resultFromStoredReceipt, StoredReceiptIncompleteError, type StoredPilotReceiptResult } from "@/src/lib/review/exercises/receipt";
import { KUZUSHIJI_PILOT_EXERCISE_ID } from "@/src/lib/review/exercises/kuzushiji-pilot";
import {
  KUZUSHIJI_PILOT_SRS_EPOCH,
  kuzushijiPilotObjectiveBinding,
} from "@/src/lib/review/exercises/kuzushiji-objective";
import { kuzushijiPilotRevision, kuzushijiPilotRevisionPayload } from "@/src/lib/review/exercises/kuzushiji-revision";
import type { ObjectiveSrsApplicationReason } from "@/src/lib/review/objective-srs";
import {
  ensureKuzushijiPilotArchive,
  getKuzushijiPilotAttemptReceipt,
  getPilotRuntimeConfig,
  issueKuzushijiPilotInstance,
  PilotRpcError,
  recordKuzushijiObjectivePilotAttempt,
  recordKuzushijiPilotAttempt,
  resolveKuzushijiPilotInstance,
  type PilotObjectiveAttemptPlan,
  type ResolvedPilotInstance,
} from "@/src/lib/supabase/pilot";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PILOT_OBJECTIVE_SCHEDULER_VERSION = "objective-four-grade-v1";

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

export type PilotAttemptResult = StoredPilotReceiptResult;

function receiptResult(
  receipt: Record<string, unknown>,
  instanceId: string,
  srsTarget: ResolvedPilotInstance["srs_target"],
): PilotAttemptResult {
  try {
    return srsTarget === "objective"
      ? resultFromStoredObjectiveReceipt(receipt, instanceId)
      : resultFromStoredReceipt(receipt, instanceId);
  } catch (error) {
    if (error instanceof StoredReceiptIncompleteError) {
      throw new PilotRpcError(error.code, 409, error.code);
    }
    throw error;
  }
}

function planPilotObjectiveSrs(input: {
  gradingStatus: "graded" | "ungraded";
  scopeAccepted: boolean;
  revisionStatus: ResolvedPilotInstance["revision_status"];
  epochActive: boolean;
}): PilotObjectiveAttemptPlan {
  let reason: ObjectiveSrsApplicationReason = "applied";
  if (input.revisionStatus === "quarantined") reason = "revision-quarantined";
  else if (input.revisionStatus === "retired") reason = "revision-retired";
  else if (kuzushijiPilotObjectiveBinding.evidenceUse === "practice-only") reason = "practice-only";
  else if (!input.scopeAccepted) reason = "scope-not-eligible";
  else if (!input.epochActive) reason = "epoch-inactive";
  else if (input.gradingStatus !== "graded") reason = "grader-unavailable";

  const srsApplied = reason === "applied";
  return {
    srsApplied,
    reason,
    revisionAllowed: input.revisionStatus === "approved",
    epochActive: input.epochActive,
    schedulerVersion: srsApplied ? PILOT_OBJECTIVE_SCHEDULER_VERSION : null,
  };
}

function assertRetryMatches(
  stored: { attempt_id: string; request_hash: string },
  request: ExerciseAttemptRequest,
  requestHash: string,
) {
  if (stored.attempt_id !== request.attemptId) {
    throw new PilotRpcError("instance_already_answered", 409, "instance_already_answered");
  }
  if (stored.request_hash !== requestHash) {
    throw new PilotRpcError("attempt_conflict", 409, "attempt_conflict");
  }
}

export async function submitKuzushijiPilotAttempt(request: ExerciseAttemptRequest): Promise<PilotAttemptResult> {
  if (!getPilotRuntimeConfig()) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const instance = await resolveKuzushijiPilotInstance(request.instanceId);
  if (instance.project_id !== "kuzushiji" || instance.exercise_id !== KUZUSHIJI_PILOT_EXERCISE_ID) {
    throw new PilotRpcError("unsupported_pilot_instance", 409, "unsupported_pilot_instance");
  }
  if (instance.srs_target !== "legacy-item" && instance.srs_target !== "objective") {
    throw new PilotRpcError("unsupported_pilot_srs_target", 409, "unsupported_pilot_srs_target");
  }

  const requestHash = hashExerciseAttemptRequest(request);
  const existing = await getKuzushijiPilotAttemptReceipt(request.instanceId);
  if (existing) {
    assertRetryMatches(existing, request, requestHash);
    return receiptResult(existing.receipt, request.instanceId, instance.srs_target);
  }

  const grading = gradeExerciseRevision(instance.revision_payload, request.rawAnswer);
  const data = await getKuzushijiDashboard();
  const currentScope = buildKuzushijiScopeSnapshot(data);
  const currentDecision = data.mode === "notion" && currentScope.sourceState === "ready"
    ? currentScope.decisions[instance.legacy_item_id]
    : undefined;
  const scopeAccepted = currentDecision?.status === "eligible";
  const revisionStatus = instance.revision_status;

  try {
    if (instance.srs_target === "objective") {
      if (revisionStatus === "draft") {
        throw new PilotRpcError("revision_not_allowed", 409, "revision_not_allowed");
      }
      const epochActive = instance.srs_epoch === String(KUZUSHIJI_PILOT_SRS_EPOCH);
      const srsPlan = planPilotObjectiveSrs({
        gradingStatus: grading.gradingStatus,
        scopeAccepted,
        revisionStatus,
        epochActive,
      });
      const receipt = await recordKuzushijiObjectivePilotAttempt({
        request,
        requestHash,
        grading,
        scopeAccepted,
        srsPlan,
      });
      return receiptResult(receipt, request.instanceId, "objective");
    }

    const srsPlan = planLegacySrs({
      gradingStatus: grading.gradingStatus,
      scopeAccepted: revisionStatus === "retired" || revisionStatus === "draft" ? false : scopeAccepted,
      revisionStatus,
    });
    const receipt = await recordKuzushijiPilotAttempt({
      request,
      requestHash,
      grading,
      selfEvaluation: request.selfEvaluation,
      scopeAccepted,
      srsPlan,
    });
    return receiptResult(receipt, request.instanceId, "legacy-item");
  } catch (error) {
    if (error instanceof PilotRpcError && error.code === "instance_already_answered") {
      const stored = await getKuzushijiPilotAttemptReceipt(request.instanceId);
      if (!stored) throw new PilotRpcError("stored_receipt_incomplete", 409, "stored_receipt_incomplete");
      assertRetryMatches(stored, request, requestHash);
      return receiptResult(stored.receipt, request.instanceId, instance.srs_target);
    }
    throw error;
  }
}
