import "server-only";

import { canonicalizeExerciseRevision } from "@/src/lib/review/exercises/revision";
import {
  kuzushijiPilotContentRelease,
  kuzushijiPilotContentReleaseV2,
  kuzushijiPilotRevision,
  kuzushijiPilotRevisionPayload,
  kuzushijiPilotRevisionV2,
  kuzushijiPilotRevisionV2Payload,
} from "@/src/lib/review/exercises/kuzushiji-revision";
import {
  KUZUSHIJI_PILOT_SRS_EPOCH,
  kuzushijiPilotObjectiveBinding,
  kuzushijiPilotV2ObjectiveBinding,
  kuzushijiPilotObjectiveContentHash,
  kuzushijiPilotObjectiveDefinition,
} from "@/src/lib/review/exercises/kuzushiji-objective";
import { canonicalizeObjectiveDefinition } from "@/src/lib/review/objectives";
import type { ObjectiveSrsApplicationReason } from "@/src/lib/review/objective-srs";
import type { ExerciseAttemptRequest, ExerciseGradingResult, LegacySrsPlan, ReviewGrade } from "@/src/lib/review/exercises/attempt";

const DEFAULT_SUPABASE_URL = "https://uhckdhdkywhsqjcquvyj.supabase.co";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECTIVE_CANONICALIZATION_VERSION = 1;

export type PilotRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
  learnerId: string;
  sourceGitSha: string;
};

export class PilotRpcError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PilotRpcError";
    this.status = status;
    this.code = code;
  }
}

export function getPilotRuntimeConfig(): PilotRuntimeConfig | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const learnerId = process.env.STUDY_GRAPH_LEARNER_ID?.trim();
  if (!serviceRoleKey || !learnerId || !UUID_PATTERN.test(learnerId)) return null;
  return {
    url: (process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    serviceRoleKey,
    learnerId,
    sourceGitSha: process.env.STUDY_GRAPH_SOURCE_GIT_SHA?.trim()
      || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
      || process.env.GIT_COMMIT_SHA?.trim()
      || "study-graph-runtime",
  };
}

function errorCode(message: string) {
  const known = /(?:archive_conflict|attempt_conflict|instance_already_answered|instance_not_found|learner_mismatch|revision_not_issuable|revision_not_allowed|pilot_archive_not_registered|pilot_[a-z_]+|objective_[a-z_]+|instance_objective_[a-z_]+|revision_objective_[a-z_]+|grading_[a-z_]+|invalid_[a-z_]+|unsupported_[a-z_]+)/.exec(message);
  return known?.[0] ?? null;
}

async function callPilotRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const bodyText = await response.text();
    let message = bodyText || `Supabase RPC ${name} failed (${response.status})`;
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; hint?: string; details?: string };
      message = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(" ") || message;
    } catch {
      // Keep the raw response when PostgREST did not return JSON.
    }
    throw new PilotRpcError(message, response.status, errorCode(message));
  }
  return (await response.json()) as T;
}

function firstRow<T>(rows: T[], name: string) {
  const row = rows[0];
  if (!row) throw new PilotRpcError(`Supabase RPC ${name} returned no row`, 502, "empty_rpc_result");
  return row;
}

export type PilotArchiveRegistration = {
  releaseId: string;
  revisionId: string;
};

async function ensureKuzushijiPilotObjectiveRegistration(
  binding = kuzushijiPilotObjectiveBinding,
) {
  const definitionRows = await callPilotRpc<Array<{ objective_id: string }>>(
    "study_graph_register_objective_definition",
    {
      p_project_id: kuzushijiPilotObjectiveDefinition.projectId,
      p_objective_id: kuzushijiPilotObjectiveDefinition.objectiveId,
      p_objective_version: kuzushijiPilotObjectiveDefinition.objectiveVersion,
      p_canonicalization_version: OBJECTIVE_CANONICALIZATION_VERSION,
      p_canonical_payload: canonicalizeObjectiveDefinition(kuzushijiPilotObjectiveDefinition),
      p_content_hash: kuzushijiPilotObjectiveContentHash,
      p_payload: kuzushijiPilotObjectiveDefinition,
    },
  );
  firstRow(definitionRows, "study_graph_register_objective_definition");

  const bindingRows = await callPilotRpc<Array<{ binding_id: string }>>(
    "study_graph_register_exercise_objective_binding",
    {
      p_revision_content_hash: binding.revisionContentHash,
      p_project_id: kuzushijiPilotObjectiveDefinition.projectId,
      p_objective_id: binding.objectiveId,
      p_objective_version: binding.objectiveVersion,
      p_evidence_use: binding.evidenceUse,
    },
  );
  firstRow(bindingRows, "study_graph_register_exercise_objective_binding");
}

export async function ensureKuzushijiPilotArchive(): Promise<PilotArchiveRegistration> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<Array<{ release_id: string; revision_id: string }>>(
    "study_graph_register_kuzushiji_pilot_archive",
    {
      p_release_id: kuzushijiPilotContentRelease.manifestHash,
      p_manifest_schema_version: kuzushijiPilotContentRelease.manifest.manifestSchemaVersion,
      p_manifest_hash: kuzushijiPilotContentRelease.manifestHash,
      p_manifest: kuzushijiPilotContentRelease.manifest,
      p_source_git_sha: kuzushijiPilotContentRelease.provenance?.sourceGitSha ?? config.sourceGitSha,
      p_project_id: kuzushijiPilotRevision.projectId,
      p_exercise_id: kuzushijiPilotRevision.exerciseId,
      p_exercise_version: kuzushijiPilotRevision.exerciseVersion,
      p_content_hash: kuzushijiPilotRevision.contentHash,
      p_canonicalization_version: kuzushijiPilotRevisionPayload.canonicalizationVersion,
      p_canonical_payload: canonicalizeExerciseRevision(kuzushijiPilotRevisionPayload),
      p_payload: kuzushijiPilotRevisionPayload,
      p_objective_id: kuzushijiPilotRevision.objectiveId,
    },
  );
  const row = firstRow(rows, "study_graph_register_kuzushiji_pilot_archive");
  await ensureKuzushijiPilotObjectiveRegistration();
  return { releaseId: row.release_id, revisionId: row.revision_id };
}

/**
 * Register the checksum-pinned v2 pilot archive idempotently.  This is a
 * server-only boundary used by the offline prefetch issuer; the existing v1
 * archive registration remains the authority for the normal Review path.
 */
export async function ensureKuzushijiPilotOfflineArchive(): Promise<PilotArchiveRegistration> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<Array<{ release_id: string; revision_id: string }>>(
    "study_graph_register_kuzushiji_pilot_v2_archive",
    {
      p_release_id: kuzushijiPilotContentReleaseV2.manifestHash,
      p_manifest_schema_version: kuzushijiPilotContentReleaseV2.manifest.manifestSchemaVersion,
      p_manifest_hash: kuzushijiPilotContentReleaseV2.manifestHash,
      p_manifest: kuzushijiPilotContentReleaseV2.manifest,
      p_source_git_sha: kuzushijiPilotContentReleaseV2.provenance?.sourceGitSha ?? config.sourceGitSha,
      p_project_id: kuzushijiPilotRevisionV2.projectId,
      p_exercise_id: kuzushijiPilotRevisionV2.exerciseId,
      p_exercise_version: kuzushijiPilotRevisionV2.exerciseVersion,
      p_content_hash: kuzushijiPilotRevisionV2.contentHash,
      p_canonicalization_version: kuzushijiPilotRevisionV2Payload.canonicalizationVersion,
      p_canonical_payload: canonicalizeExerciseRevision(kuzushijiPilotRevisionV2Payload),
      p_payload: kuzushijiPilotRevisionV2Payload,
      p_objective_id: kuzushijiPilotRevisionV2.objectiveId,
    },
  );
  const row = firstRow(rows, "study_graph_register_kuzushiji_pilot_v2_archive");
  await ensureKuzushijiPilotObjectiveRegistration(kuzushijiPilotV2ObjectiveBinding);
  return { releaseId: row.release_id, revisionId: row.revision_id };
}

export type OfflinePrefetchInstance = {
  request_id: string;
  instance_id: string;
  learner_id: string;
  project_id: string;
  release_id: string;
  revision_id: string;
  presentation: Record<string, unknown>;
  presentation_hash: string;
  issued_at: string;
  scope_evidence: Record<string, unknown>;
  snapshot_id: string | null;
  snapshot_generation: number | null;
  objective_id: string;
  objective_version: number;
  srs_epoch: number;
  evidence_use: "srs" | "practice-only";
  legacy_item_id: string;
  legacy_exercise_id: string;
  assets: unknown[];
  feedback: Record<string, unknown>;
  device_id: string;
  prefetched_at: string;
};

/** Call the v2 server-issued prefetch function with no client-controlled facts. */
export async function prefetchKuzushijiPilotInstance(input: {
  requestId: string;
  deviceId: string;
  /** Server-owned operational kill-switch result; never supplied by browser. */
  newIssuanceAllowed: boolean;
  releaseId: string;
  revisionId: string;
  snapshotId: string | null;
  snapshotGeneration: number | null;
  presentation: Record<string, unknown>;
  presentationHash: string;
  scopeEvidence: Record<string, unknown> | null;
  legacyItemId: string | null;
  legacyExerciseId: string | null;
  assets: unknown[];
  feedback: Record<string, unknown>;
}): Promise<OfflinePrefetchInstance> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<OfflinePrefetchInstance[]>(
    "study_graph_prefetch_kuzushiji_objective_instance",
    {
      p_request_id: input.requestId,
      p_learner_id: config.learnerId,
      p_project_id: "kuzushiji",
      p_device_id: input.deviceId,
      p_release_id: input.releaseId,
      p_revision_id: input.revisionId,
      p_snapshot_id: input.snapshotId,
      p_snapshot_generation: input.snapshotGeneration,
      p_presentation: input.presentation,
      p_presentation_hash: input.presentationHash,
      p_scope_evidence: input.scopeEvidence,
      p_legacy_item_id: input.legacyItemId,
      p_legacy_exercise_id: input.legacyExerciseId,
      p_assets: input.assets,
      p_feedback: input.feedback,
      p_srs_epoch: KUZUSHIJI_PILOT_SRS_EPOCH,
      p_new_issuance_allowed: input.newIssuanceAllowed,
    },
  );
  return firstRow(rows, "study_graph_prefetch_kuzushiji_objective_instance");
}

export type PilotInstanceIssue = {
  instanceId: string;
  releaseId: string;
  revisionId: string;
};

export async function issueKuzushijiPilotInstance(input: {
  releaseId: string;
  revisionId: string;
  presentation: Record<string, unknown>;
  presentationHash: string;
  scopeEvidence: Record<string, unknown>;
  legacyItemId: string;
  legacyExerciseId: string;
  knowledgeBinding?: Record<string, unknown> | null;
}): Promise<PilotInstanceIssue> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<Array<{ instance_id: string; release_id: string; revision_id: string }>>(
    "study_graph_issue_kuzushiji_objective_pilot_instance",
    {
      p_learner_id: config.learnerId,
      p_release_id: input.releaseId,
      p_revision_id: input.revisionId,
      p_presentation: input.presentation,
      p_presentation_hash: input.presentationHash,
      p_renderer_version: null,
      p_adapter_version: null,
      p_locale: "ja-JP",
      p_scope_evidence: input.scopeEvidence,
      p_knowledge_binding: input.knowledgeBinding ?? null,
      p_legacy_item_id: input.legacyItemId,
      p_legacy_exercise_id: input.legacyExerciseId,
      p_srs_epoch: KUZUSHIJI_PILOT_SRS_EPOCH,
    },
  );
  const row = firstRow(rows, "study_graph_issue_kuzushiji_objective_pilot_instance");
  return { instanceId: row.instance_id, releaseId: row.release_id, revisionId: row.revision_id };
}

export type ResolvedPilotInstance = {
  instance_id: string;
  learner_id: string;
  release_id: string;
  revision_id: string;
  presentation: Record<string, unknown>;
  presentation_hash: string;
  renderer_version: string | null;
  adapter_version: string | null;
  locale: string;
  scope_evidence: Record<string, unknown>;
  knowledge_binding: Record<string, unknown> | null;
  legacy_item_id: string;
  legacy_item_kind: string;
  legacy_exercise_id: string;
  srs_target: "legacy-item" | "objective";
  srs_epoch: string | null;
  revision_payload: typeof kuzushijiPilotRevisionPayload;
  revision_status: "draft" | "approved" | "retired" | "quarantined";
  project_id: string;
  exercise_id: string;
  exercise_version: number;
  content_hash: string;
};

export async function resolveKuzushijiPilotInstance(instanceId: string) {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<ResolvedPilotInstance[]>("study_graph_resolve_kuzushiji_pilot_instance", {
    p_instance_id: instanceId,
    p_learner_id: config.learnerId,
  });
  return firstRow(rows, "study_graph_resolve_kuzushiji_pilot_instance");
}

export type PilotAttemptReceipt = {
  attempt_id: string;
  request_hash: string;
  receipt: Record<string, unknown>;
};

export async function getKuzushijiPilotAttemptReceipt(instanceId: string) {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<PilotAttemptReceipt[]>("study_graph_get_kuzushiji_pilot_attempt_receipt", {
    p_instance_id: instanceId,
    p_learner_id: config.learnerId,
  });
  return rows[0] ?? null;
}

export type PilotObjectiveReviewState = {
  learner_id: string;
  project_id: string;
  objective_id: string;
  srs_epoch: number;
  last_grade: ReviewGrade;
  repetitions: number;
  interval_days: number;
  last_reviewed_at: string;
  due_at: string;
  scheduler_version: string;
  state_revision: number;
};

export async function getKuzushijiPilotObjectiveState(): Promise<PilotObjectiveReviewState | null> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<PilotObjectiveReviewState[]>("study_graph_get_kuzushiji_pilot_objective_state", {
    p_learner_id: config.learnerId,
  });
  return rows[0] ?? null;
}

export async function recordKuzushijiPilotAttempt(input: {
  request: ExerciseAttemptRequest;
  requestHash: string;
  grading: ExerciseGradingResult;
  selfEvaluation: ExerciseAttemptRequest["selfEvaluation"];
  scopeAccepted: boolean;
  srsPlan: LegacySrsPlan;
}) {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<Array<{ receipt: Record<string, unknown> }>>(
    "study_graph_record_exercise_attempt",
    {
      p_attempt_id: input.request.attemptId,
      p_instance_id: input.request.instanceId,
      p_learner_id: config.learnerId,
      p_request_hash: input.requestHash,
      p_raw_answer: input.request.rawAnswer,
      p_normalized_answer: input.grading.normalizedAnswer,
      p_grading_status: input.grading.gradingStatus,
      p_grading_authority: input.grading.gradingAuthority,
      p_grading_strategy_id: input.grading.gradingStrategyId,
      p_grading_strategy_version: input.grading.gradingStrategyVersion,
      p_normalizer_version: input.grading.normalizerVersion,
      p_is_correct: input.grading.isCorrect,
      p_self_evaluation: input.selfEvaluation,
      p_effective_srs_grade: input.srsPlan.srsApplied ? input.selfEvaluation : null,
      p_response_ms: input.request.responseMs,
      p_used_hint: input.request.usedHint,
      p_scope_accepted: input.scopeAccepted,
      p_srs_applied: input.srsPlan.srsApplied,
      p_srs_reason: input.srsPlan.reason,
      p_scheduler_version: null,
    },
  );
  return firstRow(rows, "study_graph_record_exercise_attempt").receipt;
}

export type PilotObjectiveAttemptPlan = {
  srsApplied: boolean;
  reason: ObjectiveSrsApplicationReason;
  revisionAllowed: boolean;
  epochActive: boolean;
  schedulerVersion: string | null;
};

export async function recordKuzushijiObjectivePilotAttempt(input: {
  request: ExerciseAttemptRequest;
  requestHash: string;
  grading: ExerciseGradingResult;
  scopeAccepted: boolean;
  srsPlan: PilotObjectiveAttemptPlan;
}) {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const rows = await callPilotRpc<Array<{ receipt: Record<string, unknown> }>>(
    "study_graph_record_objective_attempt",
    {
      p_attempt_id: input.request.attemptId,
      p_instance_id: input.request.instanceId,
      p_learner_id: config.learnerId,
      p_request_hash: input.requestHash,
      p_raw_answer: input.request.rawAnswer,
      p_normalized_answer: input.grading.normalizedAnswer,
      p_grading_status: input.grading.gradingStatus,
      p_grading_authority: input.grading.gradingAuthority,
      p_grading_strategy_id: input.grading.gradingStrategyId,
      p_grading_strategy_version: input.grading.gradingStrategyVersion,
      p_normalizer_version: input.grading.normalizerVersion,
      p_is_correct: input.grading.isCorrect,
      p_self_evaluation: input.request.selfEvaluation,
      p_effective_srs_grade: input.srsPlan.srsApplied ? input.request.selfEvaluation : null,
      p_response_ms: input.request.responseMs,
      p_used_hint: input.request.usedHint,
      p_scope_accepted: input.scopeAccepted,
      p_revision_allowed: input.srsPlan.revisionAllowed,
      p_epoch_active: input.srsPlan.epochActive,
      p_srs_applied: input.srsPlan.srsApplied,
      p_srs_reason: input.srsPlan.reason,
      p_scheduler_version: input.srsPlan.schedulerVersion,
    },
  );
  return firstRow(rows, "study_graph_record_objective_attempt").receipt;
}
