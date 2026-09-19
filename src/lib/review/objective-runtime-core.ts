import { hashExerciseAttemptRequest, type ExerciseAttemptRequest, type ExerciseGradingResult } from "./exercises/attempt.ts";
import { resultFromStoredObjectiveReceipt } from "./exercises/receipt.ts";
import { readObjectiveSchedulingContext } from "./objective-recovery.ts";
import {
  assertValidObjectiveSchedulingContextV1,
  OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1,
  OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1,
} from "./objective-opportunity.ts";

export type ObjectiveRuntimeErrorCode =
  | "attempt_conflict" | "instance_already_answered" | "objective_not_due"
  | "instance_unavailable" | "archive_unavailable" | "invalid_authority_response"
  | "invalid_runtime_input" | "objective_runtime_unavailable" | "v2_issuance_disabled"
  | "acceptance_version_mismatch";

/** Bounded messages only: never retain SQL detail, credentials or raw responses. */
export class ObjectiveRuntimeError extends Error {
  readonly code: ObjectiveRuntimeErrorCode;
  constructor(code: ObjectiveRuntimeErrorCode) {
    super(code);
    this.name = "ObjectiveRuntimeError";
    this.code = code;
  }
}

export function objectiveRuntimeFailure(error: unknown) {
  const code = error instanceof ObjectiveRuntimeError ? error.code : "objective_runtime_unavailable";
  const status = code === "invalid_runtime_input" ? 400
    : code === "invalid_authority_response" ? 502
    : ["objective_runtime_unavailable", "v2_issuance_disabled"].includes(code) ? 503 : 409;
  return { status, error: code };
}

export function objectiveRpcFailure(payload: unknown): ObjectiveRuntimeError {
  const message = isRecord(payload) ? payload.message : undefined;
  if (message === "attempt_conflict" || message === "instance_already_answered" || message === "objective_not_due") {
    return new ObjectiveRuntimeError(message);
  }
  if (["instance_not_found", "learner_mismatch", "instance_objective_binding_not_found"].includes(String(message))) {
    return new ObjectiveRuntimeError("instance_unavailable");
  }
  if (["objective_archive_not_registered", "objective_binding_not_registered", "objective_binding_project_mismatch",
    "objective_binding_not_srs_capable", "revision_not_issuable", "revision_not_allowed", "revision_not_found",
    "grading_revision_mismatch", "instance_objective_project_mismatch"].includes(String(message))) {
    return new ObjectiveRuntimeError("archive_unavailable");
  }
  return new ObjectiveRuntimeError("objective_runtime_unavailable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function exact(value: unknown, keys: readonly string[], code: ObjectiveRuntimeErrorCode): asserts value is Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new ObjectiveRuntimeError(code);
  }
}
function oneRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new ObjectiveRuntimeError(Array.isArray(value) && value.length === 0 ? "instance_unavailable" : "invalid_authority_response");
  }
  return value[0];
}

/** Configuration supplied by the server, never a request-body authority option. */
export function selectNewObjectiveIssuer(v2Enabled = false): "v1" | "v2" {
  return v2Enabled === true ? "v2" : "v1";
}

const ROUTING_KEYS = ["instance_id", "project_id", "objective_id", "objective_version", "srs_epoch", "evidence_use",
  "scheduling_context_version", "opportunity_kind", "expected_state_revision", "grade_policy_version",
  "activation_policy_version", "issued_at", "expires_at", "due_at_observed"] as const;

/** The input must be the ownership-filtered resolver RPC result, not a browser claim. */
export function decodeObjectiveInstanceRouting(rows: unknown, instanceId: string) {
  const row = oneRow(rows);
  exact(row, ROUTING_KEYS, "invalid_authority_response");
  if (!uuid(row.instance_id) || row.instance_id !== instanceId || !text(row.project_id) || !text(row.objective_id)
    || !positive(row.objective_version) || !positive(row.srs_epoch)
    || (row.evidence_use !== "srs" && row.evidence_use !== "practice-only")) {
    throw new ObjectiveRuntimeError("invalid_authority_response");
  }
  try {
    const context = readObjectiveSchedulingContext({
      schedulingContextVersion: row.scheduling_context_version,
      opportunityKind: row.opportunity_kind,
      effectiveEvidenceUse: row.evidence_use,
      expectedStateRevision: row.expected_state_revision,
      gradePolicyVersion: row.grade_policy_version,
      activationPolicyVersion: row.activation_policy_version,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      dueAtObserved: row.due_at_observed,
    });
    return Object.freeze({
      instanceId: row.instance_id, projectId: row.project_id, objectiveId: row.objective_id,
      objectiveVersion: row.objective_version, srsEpoch: row.srs_epoch, evidenceUse: row.evidence_use,
      context, acceptanceVersion: context.kind === "historical-v1" ? "v1" as const : "v2" as const,
    });
  } catch {
    throw new ObjectiveRuntimeError("invalid_authority_response");
  }
}
export type ObjectiveInstanceRouting = ReturnType<typeof decodeObjectiveInstanceRouting>;

export type ObjectiveIssueInput = Readonly<{
  releaseId: string; revisionId: string; presentation: Record<string, unknown>; presentationHash: string;
  rendererVersion: string | null; adapterVersion: string | null; locale: string;
  scopeEvidence: Record<string, unknown>; knowledgeBinding: Record<string, unknown> | null;
  legacyItemId: string; legacyItemKind: "character" | "mistake" | "knowledge"; legacyExerciseId: string;
  srsEpoch: number; intent: "scheduled" | "practice";
}>;

export function objectiveIssueParameters(input: ObjectiveIssueInput, learnerId: string) {
  exact(input, ["releaseId", "revisionId", "presentation", "presentationHash", "rendererVersion", "adapterVersion", "locale",
    "scopeEvidence", "knowledgeBinding", "legacyItemId", "legacyItemKind", "legacyExerciseId", "srsEpoch", "intent"], "invalid_runtime_input");
  if (!uuid(learnerId) || !text(input.releaseId) || !uuid(input.revisionId) || !isRecord(input.presentation)
    || !hash(input.presentationHash) || !text(input.locale) || !isRecord(input.scopeEvidence)
    || (input.knowledgeBinding !== null && !isRecord(input.knowledgeBinding))
    || (input.rendererVersion !== null && !text(input.rendererVersion)) || (input.adapterVersion !== null && !text(input.adapterVersion))
    || !text(input.legacyItemId) || !text(input.legacyExerciseId) || !positive(input.srsEpoch)
    || !["character", "mistake", "knowledge"].includes(input.legacyItemKind)
    || !["scheduled", "practice"].includes(input.intent)) throw new ObjectiveRuntimeError("invalid_runtime_input");
  return {
    p_learner_id: learnerId, p_release_id: input.releaseId, p_revision_id: input.revisionId,
    p_presentation: input.presentation, p_presentation_hash: input.presentationHash,
    p_renderer_version: input.rendererVersion, p_adapter_version: input.adapterVersion, p_locale: input.locale,
    p_scope_evidence: input.scopeEvidence, p_knowledge_binding: input.knowledgeBinding,
    p_legacy_item_id: input.legacyItemId, p_legacy_item_kind: input.legacyItemKind,
    p_legacy_exercise_id: input.legacyExerciseId, p_srs_epoch: input.srsEpoch, p_intent: input.intent,
  };
}

export function decodeObjectiveIssue(rows: unknown, input: ObjectiveIssueInput) {
  const row = oneRow(rows);
  exact(row, ["instance_id", "release_id", "revision_id", "opportunity_kind", "effective_evidence_use",
    "expected_state_revision", "issued_at", "expires_at", "reused"], "invalid_authority_response");
  if (!uuid(row.instance_id) || !text(row.release_id) || !uuid(row.revision_id) || typeof row.reused !== "boolean"
    || (input.intent === "practice" ? row.opportunity_kind !== "practice" || row.reused : row.opportunity_kind === "practice")
    // Reuse may legitimately return another revision of this same Objective.
    || (!row.reused && (row.release_id !== input.releaseId || row.revision_id !== input.revisionId))) {
    throw new ObjectiveRuntimeError("invalid_authority_response");
  }
  try {
    assertValidObjectiveSchedulingContextV1({
      contractVersion: 1, opportunityKind: row.opportunity_kind, effectiveEvidenceUse: row.effective_evidence_use,
      expectedStateRevision: row.expected_state_revision, issuedAt: row.issued_at, expiresAt: row.expires_at,
      gradePolicyVersion: OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1,
      activationPolicyVersion: OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1,
    });
  } catch { throw new ObjectiveRuntimeError("invalid_authority_response"); }
  return Object.freeze({
    instanceId: row.instance_id, releaseId: row.release_id, revisionId: row.revision_id,
    opportunityKind: row.opportunity_kind as "unseen" | "due" | "practice",
    effectiveEvidenceUse: row.effective_evidence_use as "srs" | "practice-only",
    expectedStateRevision: row.expected_state_revision as number | null,
    issuedAt: row.issued_at as string, expiresAt: row.expires_at as string | null, reused: row.reused,
  });
}

/** Validate/copy the existing six fields before awaiting any server work. */
export function immutableObjectiveAttempt(request: ExerciseAttemptRequest): Readonly<ExerciseAttemptRequest> {
  const allowed = ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint", "submittedAt", "clientTimestamp"];
  const answer = request?.rawAnswer;
  if (!isRecord(request) || Object.keys(request).some((key) => !allowed.includes(key))
    || !uuid(request.attemptId) || !uuid(request.instanceId)
    || !(typeof answer === "string" || (isRecord(answer) && answer.type === "text" && typeof answer.value === "string"))
    || (request.selfEvaluation !== null && !["again", "hard", "good", "easy"].includes(request.selfEvaluation))
    || (request.responseMs !== null && (!Number.isSafeInteger(request.responseMs) || request.responseMs < 0 || request.responseMs > 3_600_000))
    || typeof request.usedHint !== "boolean") throw new ObjectiveRuntimeError("invalid_runtime_input");
  // Preserve every rawAnswer byte/field included by the historical hash contract.
  const rawAnswer = typeof answer === "string" ? answer : Object.freeze(JSON.parse(JSON.stringify(answer)));
  return Object.freeze({ attemptId: request.attemptId, instanceId: request.instanceId, rawAnswer,
    selfEvaluation: request.selfEvaluation, responseMs: request.responseMs, usedHint: request.usedHint });
}

export type ObjectiveAcceptanceFacts = Readonly<{
  request: ExerciseAttemptRequest; requestHash: string; grading: ExerciseGradingResult;
  scopeAccepted: boolean; epochActive: boolean;
}>;

export function objectiveAcceptanceParameters(input: ObjectiveAcceptanceFacts, learnerId: string) {
  exact(input, ["request", "requestHash", "grading", "scopeAccepted", "epochActive"], "invalid_runtime_input");
  const request = immutableObjectiveAttempt(input.request);
  const g = input.grading;
  exact(g, ["gradingStatus", "normalizedAnswer", "isCorrect", "gradingAuthority", "gradingStrategyId",
    "gradingStrategyVersion", "normalizerVersion"], "invalid_runtime_input");
  if (!uuid(learnerId) || input.requestHash !== hashExerciseAttemptRequest(request)
    || typeof input.scopeAccepted !== "boolean" || typeof input.epochActive !== "boolean"
    || g.gradingAuthority !== "server" || !text(g.gradingStrategyId) || !positive(g.gradingStrategyVersion) || !text(g.normalizerVersion)
    || (g.normalizedAnswer !== null && typeof g.normalizedAnswer !== "string")
    || (g.gradingStatus === "graded" ? typeof g.isCorrect !== "boolean" : g.gradingStatus !== "ungraded" || g.isCorrect !== null)) {
    throw new ObjectiveRuntimeError("invalid_runtime_input");
  }
  return {
    p_attempt_id: request.attemptId, p_instance_id: request.instanceId, p_learner_id: learnerId, p_request_hash: input.requestHash,
    p_raw_answer: request.rawAnswer, p_normalized_answer: g.normalizedAnswer, p_grading_status: g.gradingStatus,
    p_grading_authority: g.gradingAuthority, p_grading_strategy_id: g.gradingStrategyId,
    p_grading_strategy_version: g.gradingStrategyVersion, p_normalizer_version: g.normalizerVersion, p_is_correct: g.isCorrect,
    p_self_evaluation: request.selfEvaluation, p_response_ms: request.responseMs, p_used_hint: request.usedHint,
    p_scope_accepted: input.scopeAccepted, p_epoch_active: input.epochActive,
  };
}

export function decodeObjectiveReceiptV2(receipt: unknown, request: ExerciseAttemptRequest) {
  try {
    exact(receipt, ["receiptVersion", "attemptId", "instanceId", "acceptedAt", "projectId", "objectiveId", "objectiveVersion",
      "srsEpoch", "evidenceUse", "gradingStatus", "isCorrect", "applied", "reason", "effectiveGrade", "stateRevision", "dueAt"], "invalid_authority_response");
    const restored = resultFromStoredObjectiveReceipt(receipt, request.instanceId);
    if (restored.receipt.receiptVersion !== 2 || restored.attemptId !== request.attemptId) throw new Error();
    return restored;
  } catch { throw new ObjectiveRuntimeError("invalid_authority_response"); }
}

export function decodeObjectiveAcceptance(rows: unknown, request: ExerciseAttemptRequest) {
  const row = oneRow(rows);
  exact(row, ["receipt"], "invalid_authority_response");
  return decodeObjectiveReceiptV2(row.receipt, request);
}

/** Receipt lookup is already learner-scoped in SQL; no current authority is consulted here. */
export function recoverObjectiveV2Retry(rows: unknown, request: ExerciseAttemptRequest, requestHash: string) {
  if (Array.isArray(rows) && rows.length === 0) return null;
  const row = oneRow(rows);
  exact(row, ["attempt_id", "request_hash", "receipt"], "invalid_authority_response");
  if (!uuid(row.attempt_id) || !hash(row.request_hash)) throw new ObjectiveRuntimeError("invalid_authority_response");
  if (row.attempt_id !== request.attemptId) throw new ObjectiveRuntimeError("instance_already_answered");
  if (row.request_hash !== requestHash) throw new ObjectiveRuntimeError("attempt_conflict");
  return decodeObjectiveReceiptV2(row.receipt, request);
}
