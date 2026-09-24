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
  issueObjectiveInstanceV2,
  newObjectiveIssuanceVersion,
  resolveObjectiveAcceptanceRouting,
  submitObjectiveAttemptV2,
} from "@/src/lib/review/objective-runtime";
import {
  immutableObjectiveAttempt,
  ObjectiveRuntimeError,
  objectiveRuntimeFailure,
} from "@/src/lib/review/objective-runtime-core";
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

export { validatePilotAttemptInput } from "./pilot-attempt-contract";

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

function objectivePilotError(error: unknown): PilotRpcError {
  const failure = objectiveRuntimeFailure(error);
  return new PilotRpcError(failure.error, failure.status, failure.error);
}

function assertResolvedKuzushijiPilotInstance(instance: ResolvedPilotInstance) {
  if (instance.project_id !== "kuzushiji" || instance.exercise_id !== KUZUSHIJI_PILOT_EXERCISE_ID) {
    throw new PilotRpcError("unsupported_pilot_instance", 409, "unsupported_pilot_instance");
  }
  return instance;
}

function assertPersistedPilotPresentation(value: Record<string, unknown>): PilotPresentation {
  const asset = value.asset;
  if (
    typeof value.prompt !== "string"
    || typeof value.front !== "string"
    || !asset || typeof asset !== "object" || Array.isArray(asset)
  ) {
    throw new PilotRpcError("pilot_instance_mismatch", 502, "pilot_instance_mismatch");
  }
  const candidate = asset as Record<string, unknown>;
  if (
    typeof candidate.src !== "string"
    || typeof candidate.alt !== "string"
    || typeof candidate.width !== "number"
    || typeof candidate.height !== "number"
    || !candidate.source || typeof candidate.source !== "object" || Array.isArray(candidate.source)
  ) {
    throw new PilotRpcError("pilot_instance_mismatch", 502, "pilot_instance_mismatch");
  }
  const source = candidate.source as Record<string, unknown>;
  if (
    typeof source.url !== "string"
    || typeof source.attribution !== "string"
    || typeof source.license !== "string"
  ) {
    throw new PilotRpcError("pilot_instance_mismatch", 502, "pilot_instance_mismatch");
  }
  return value as unknown as PilotPresentation;
}

function receiptResultFromStoredAttempt(
  receipt: Record<string, unknown>,
  instanceId: string,
): PilotAttemptResult {
  // Objective receipts have a distinct immutable attribution shape. A v1
  // receipt with that shape is still read by the strict Objective reader;
  // legacy v1 receipts continue through the historical reader.
  const objectiveReceipt = Object.hasOwn(receipt, "projectId")
    || Object.hasOwn(receipt, "objectiveId")
    || Object.hasOwn(receipt, "applied")
    || Object.hasOwn(receipt, "evidenceUse");
  return objectiveReceipt
    ? resultFromStoredObjectiveReceipt(receipt, instanceId)
    : resultFromStoredReceipt(receipt, instanceId);
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

  if (newObjectiveIssuanceVersion() === "v2") {
    try {
      const issued = await issueObjectiveInstanceV2({
        releaseId: archive.releaseId,
        revisionId: archive.revisionId,
        presentation: presentation as unknown as Record<string, unknown>,
        presentationHash: hashPilotPresentation(presentation),
        rendererVersion: null,
        adapterVersion: null,
        locale: "ja-JP",
        scopeEvidence: buildPilotScopeEvidence(input.scope, input.character.id) as unknown as Record<string, unknown>,
        knowledgeBinding: null,
        legacyItemId: input.character.id,
        legacyItemKind: "character",
        legacyExerciseId: input.legacyExerciseId,
        srsEpoch: KUZUSHIJI_PILOT_SRS_EPOCH,
        intent: "scheduled",
      });

      // The generic issuer may reuse an active opportunity belonging to a
      // different immutable revision. The returned instance is the sole
      // presentation authority for both new and reused issuance.
      const persisted = assertResolvedKuzushijiPilotInstance(
        await resolveKuzushijiPilotInstance(issued.instanceId),
      );
      if (
        persisted.instance_id !== issued.instanceId
        || persisted.srs_target !== "objective"
        || persisted.release_id !== issued.releaseId
        || persisted.revision_id !== issued.revisionId
      ) {
        throw new PilotRpcError("pilot_instance_mismatch", 502, "pilot_instance_mismatch");
      }
      return {
        instanceId: persisted.instance_id,
        releaseId: persisted.release_id,
        revisionId: persisted.revision_id,
        presentation: assertPersistedPilotPresentation(persisted.presentation),
        reused: issued.reused,
      };
    } catch (error) {
      if (error instanceof ObjectiveRuntimeError) throw objectivePilotError(error);
      throw error;
    }
  }

  const issue = await issueKuzushijiPilotInstance({
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    presentation: presentation as unknown as Record<string, unknown>,
    presentationHash: hashPilotPresentation(presentation),
    scopeEvidence: buildPilotScopeEvidence(input.scope, input.character.id) as unknown as Record<string, unknown>,
    legacyItemId: input.character.id,
    legacyExerciseId: input.legacyExerciseId,
  });
  return { ...issue, presentation, reused: false };
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

/** Shared retry gate: accepted authority is restored before project routing. */
export async function recoverAcceptedPilotAttempt(request: ExerciseAttemptRequest): Promise<{
  immutableRequest: Readonly<ExerciseAttemptRequest>;
  requestHash: string;
  result: PilotAttemptResult | null;
}> {
  if (!getPilotRuntimeConfig()) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  // Validate and hash the immutable six-field request before any instance,
  // routing, grading, Scope, epoch or Objective state read.
  let immutableRequest: Readonly<ExerciseAttemptRequest>;
  try {
    immutableRequest = immutableObjectiveAttempt(request);
  } catch (error) {
    if (error instanceof ObjectiveRuntimeError) {
      throw new PilotRpcError("invalid_runtime_input", 400, "invalid_runtime_input");
    }
    throw error;
  }
  const requestHash = hashExerciseAttemptRequest(immutableRequest);
  const existing = await getKuzushijiPilotAttemptReceipt(request.instanceId);
  if (existing) {
    assertRetryMatches(existing, immutableRequest, requestHash);
    try {
      return { immutableRequest, requestHash, result: receiptResultFromStoredAttempt(existing.receipt, request.instanceId) };
    } catch (error) {
      if (error instanceof StoredReceiptIncompleteError) {
        throw new PilotRpcError(error.code, 409, error.code);
      }
      throw error;
    }
  }
  return { immutableRequest, requestHash, result: null };
}

export async function submitKuzushijiPilotAttempt(request: ExerciseAttemptRequest): Promise<PilotAttemptResult> {
  const { immutableRequest, requestHash, result } = await recoverAcceptedPilotAttempt(request);
  if (result) return result;

  const instance = assertResolvedKuzushijiPilotInstance(
    await resolveKuzushijiPilotInstance(request.instanceId),
  );
  if (instance.srs_target !== "legacy-item" && instance.srs_target !== "objective") {
    throw new PilotRpcError("unsupported_pilot_srs_target", 409, "unsupported_pilot_srs_target");
  }

  const revisionStatus = instance.revision_status;

  try {
    if (instance.srs_target === "objective") {
      if (revisionStatus === "draft") {
        throw new PilotRpcError("revision_not_allowed", 409, "revision_not_allowed");
      }

      let routing;
      try {
        routing = await resolveObjectiveAcceptanceRouting(request.instanceId);
      } catch (error) {
        if (error instanceof ObjectiveRuntimeError) throw objectivePilotError(error);
        throw error;
      }
      if (
        routing.projectId !== instance.project_id
        || routing.srsEpoch !== Number(instance.srs_epoch)
      ) {
        throw new PilotRpcError("pilot_instance_mismatch", 502, "pilot_instance_mismatch");
      }

      // Historical all-null Objective bindings retain the v1 writer and
      // semantics. A complete pinned context is the only v2 entry point.
      if (routing.acceptanceVersion === "v2") {
        try {
          return await submitObjectiveAttemptV2(immutableRequest, {
            grade: async () => gradeExerciseRevision(instance.revision_payload, immutableRequest.rawAnswer),
            freshScope: async () => {
              const data = await getKuzushijiDashboard();
              const currentScope = buildKuzushijiScopeSnapshot(data);
              return data.mode === "notion"
                && currentScope.sourceState === "ready"
                && currentScope.decisions[instance.legacy_item_id]?.status === "eligible";
            },
            epochActive: async () => instance.srs_epoch === String(KUZUSHIJI_PILOT_SRS_EPOCH),
          });
        } catch (error) {
          if (error instanceof ObjectiveRuntimeError) throw objectivePilotError(error);
          throw error;
        }
      }

      const data = await getKuzushijiDashboard();
      const currentScope = buildKuzushijiScopeSnapshot(data);
      const currentDecision = data.mode === "notion" && currentScope.sourceState === "ready"
        ? currentScope.decisions[instance.legacy_item_id]
        : undefined;
      const scopeAccepted = currentDecision?.status === "eligible";
      const epochActive = instance.srs_epoch === String(KUZUSHIJI_PILOT_SRS_EPOCH);
      const grading = gradeExerciseRevision(instance.revision_payload, immutableRequest.rawAnswer);
      const srsPlan = planPilotObjectiveSrs({
        gradingStatus: grading.gradingStatus,
        scopeAccepted,
        revisionStatus,
        epochActive,
      });
      const receipt = await recordKuzushijiObjectivePilotAttempt({
        request: immutableRequest,
        requestHash,
        grading,
        scopeAccepted,
        srsPlan,
      });
      return receiptResult(receipt, request.instanceId, "objective");
    }

    const data = await getKuzushijiDashboard();
    const currentScope = buildKuzushijiScopeSnapshot(data);
    const currentDecision = data.mode === "notion" && currentScope.sourceState === "ready"
      ? currentScope.decisions[instance.legacy_item_id]
      : undefined;
    const scopeAccepted = currentDecision?.status === "eligible";
    const grading = gradeExerciseRevision(instance.revision_payload, immutableRequest.rawAnswer);
    const srsPlan = planLegacySrs({
      gradingStatus: grading.gradingStatus,
      scopeAccepted: revisionStatus === "retired" || revisionStatus === "draft" ? false : scopeAccepted,
      revisionStatus,
    });
    const receipt = await recordKuzushijiPilotAttempt({
      request: immutableRequest,
      requestHash,
      grading,
      selfEvaluation: immutableRequest.selfEvaluation,
      scopeAccepted,
      srsPlan,
    });
    return receiptResult(receipt, request.instanceId, "legacy-item");
  } catch (error) {
    if (error instanceof PilotRpcError && error.code === "instance_already_answered") {
      const stored = await getKuzushijiPilotAttemptReceipt(request.instanceId);
      if (!stored) throw new PilotRpcError("stored_receipt_incomplete", 409, "stored_receipt_incomplete");
      assertRetryMatches(stored, immutableRequest, requestHash);
      try {
        return receiptResultFromStoredAttempt(stored.receipt, request.instanceId);
      } catch (receiptError) {
        if (receiptError instanceof StoredReceiptIncompleteError) {
          throw new PilotRpcError(receiptError.code, 409, receiptError.code);
        }
        throw receiptError;
      }
    }
    throw error;
  }
}
