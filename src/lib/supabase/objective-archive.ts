import "server-only";

import {
  canonicalizeExerciseRevision,
  getExerciseRevisionPayload,
  type ContentRelease,
  type ExerciseRevision,
} from "../review/exercises/revision.ts";
import {
  assertValidExerciseObjectiveBinding,
  assertValidObjectiveDefinition,
  canonicalizeObjectiveDefinition,
  hashObjectiveDefinition,
  type ExerciseObjectiveBinding,
  type ObjectiveDefinition,
} from "../review/objectives.ts";

const DEFAULT_SUPABASE_URL = "https://uhckdhdkywhsqjcquvyj.supabase.co";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ObjectiveArchiveRpcError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ObjectiveArchiveRpcError";
    this.status = status;
    this.code = code;
  }
}

export type ObjectiveArchiveRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
  sourceGitSha: string;
};

export function getObjectiveArchiveRuntimeConfig(): ObjectiveArchiveRuntimeConfig | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;
  return {
    url: (process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    serviceRoleKey,
    sourceGitSha: process.env.STUDY_GRAPH_SOURCE_GIT_SHA?.trim()
      || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
      || process.env.GIT_COMMIT_SHA?.trim()
      || "study-graph-runtime",
  };
}

function errorCode(message: string) {
  const known = /(?:archive_conflict|objective_archive_conflict|objective_content_hash_conflict|revision_payload_identity_mismatch|invalid_[a-z_]+|objective_[a-z_]+|revision_[a-z_]+)/.exec(message);
  return known?.[0] ?? null;
}

async function callObjectiveRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const config = getObjectiveArchiveRuntimeConfig();
  if (!config) throw new ObjectiveArchiveRpcError("objective_archive_runtime_not_configured", 503, "objective_archive_runtime_not_configured");
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
    let detail = "";
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; hint?: string; details?: string };
      detail = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(" ");
    } catch {
      // Do not expose raw Postgres/PostgREST response bodies to callers.
    }
    const code = errorCode(detail);
    throw new ObjectiveArchiveRpcError(code ?? `objective_archive_rpc_failed_${response.status}`, response.status, code);
  }
  return (await response.json()) as T;
}

function firstRow<T>(rows: T[], name: string) {
  const row = rows[0];
  if (!row) throw new ObjectiveArchiveRpcError(`Supabase RPC ${name} returned no row`, 502, "empty_rpc_result");
  return row;
}

export type ObjectiveArchiveRegistrationInput = {
  contentRelease: ContentRelease;
  revision: ExerciseRevision;
  objectiveDefinition: ObjectiveDefinition;
  exerciseObjectiveBinding: ExerciseObjectiveBinding;
  sourceGitSha?: string;
};

export type ObjectiveArchiveRegistration = {
  releaseId: string;
  revisionId: string;
  bindingId: string;
};

function assertArchiveInput(input: ObjectiveArchiveRegistrationInput) {
  const { contentRelease, revision, objectiveDefinition, exerciseObjectiveBinding } = input;
  assertValidObjectiveDefinition(objectiveDefinition);
  assertValidExerciseObjectiveBinding(exerciseObjectiveBinding);
  const entry = contentRelease.manifest.revisionEntries.find((candidate) =>
    candidate.projectId === revision.projectId
      && candidate.exerciseId === revision.exerciseId
      && candidate.exerciseVersion === revision.exerciseVersion,
  );
  if (!entry || entry.contentHash !== revision.contentHash) {
    throw new Error("Objective archive release does not contain the immutable revision");
  }
  if (revision.projectId !== objectiveDefinition.projectId
    || revision.objectiveId !== objectiveDefinition.objectiveId
    || revision.exerciseVersion <= 0
    || exerciseObjectiveBinding.revisionContentHash !== revision.contentHash
    || exerciseObjectiveBinding.objectiveId !== objectiveDefinition.objectiveId
    || exerciseObjectiveBinding.objectiveVersion !== objectiveDefinition.objectiveVersion) {
    throw new Error("Objective archive identity is inconsistent");
  }
}

/** Register immutable archive, Objective, and Exercise→Objective facts in order. */
export async function ensureObjectiveArchive(
  input: ObjectiveArchiveRegistrationInput,
): Promise<ObjectiveArchiveRegistration> {
  assertArchiveInput(input);
  const config = getObjectiveArchiveRuntimeConfig();
  if (!config) throw new ObjectiveArchiveRpcError("objective_archive_runtime_not_configured", 503, "objective_archive_runtime_not_configured");
  const payload = getExerciseRevisionPayload(input.revision);
  const archiveRows = await callObjectiveRpc<Array<{ release_id: string; revision_id: string }>>(
    "study_graph_register_objective_archive",
    {
      p_release_id: input.contentRelease.manifestHash,
      p_manifest_schema_version: input.contentRelease.manifest.manifestSchemaVersion,
      p_manifest_hash: input.contentRelease.manifestHash,
      p_manifest: input.contentRelease.manifest,
      p_source_git_sha: input.sourceGitSha?.trim() || input.contentRelease.provenance?.sourceGitSha || config.sourceGitSha,
      p_project_id: input.revision.projectId,
      p_exercise_id: input.revision.exerciseId,
      p_exercise_version: input.revision.exerciseVersion,
      p_content_hash: input.revision.contentHash,
      p_canonicalization_version: payload.canonicalizationVersion,
      p_canonical_payload: canonicalizeExerciseRevision(payload),
      p_payload: payload,
      p_objective_id: input.revision.objectiveId,
    },
  );
  const archive = firstRow(archiveRows, "study_graph_register_objective_archive");

  await firstRow(await callObjectiveRpc<Array<{ objective_id: string }>>(
    "study_graph_register_objective_definition",
    {
      p_project_id: input.objectiveDefinition.projectId,
      p_objective_id: input.objectiveDefinition.objectiveId,
      p_objective_version: input.objectiveDefinition.objectiveVersion,
      p_canonicalization_version: 1,
      p_canonical_payload: canonicalizeObjectiveDefinition(input.objectiveDefinition),
      p_content_hash: hashObjectiveDefinition(input.objectiveDefinition),
      p_payload: input.objectiveDefinition,
    },
  ), "study_graph_register_objective_definition");

  const binding = firstRow(await callObjectiveRpc<Array<{ binding_id: string }>>(
    "study_graph_register_exercise_objective_binding",
    {
      p_revision_content_hash: input.exerciseObjectiveBinding.revisionContentHash,
      p_project_id: input.objectiveDefinition.projectId,
      p_objective_id: input.exerciseObjectiveBinding.objectiveId,
      p_objective_version: input.exerciseObjectiveBinding.objectiveVersion,
      p_evidence_use: input.exerciseObjectiveBinding.evidenceUse,
    },
  ), "study_graph_register_exercise_objective_binding");

  return { releaseId: archive.release_id, revisionId: archive.revision_id, bindingId: binding.binding_id };
}

export type ResolvedObjectiveInstanceArchive = {
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
  revision_payload: Record<string, unknown>;
  revision_status: string;
  project_id: string;
  exercise_id: string;
  exercise_version: number;
  content_hash: string;
};

/** Resolve the persisted archive for a trusted learner/instance pair. */
export async function resolveObjectiveInstanceArchive(
  instanceId: string,
  learnerId: string,
): Promise<ResolvedObjectiveInstanceArchive | null> {
  if (!UUID_PATTERN.test(instanceId) || !UUID_PATTERN.test(learnerId)) {
    throw new ObjectiveArchiveRpcError("invalid_instance_identity", 400, "invalid_instance_identity");
  }
  const rows = await callObjectiveRpc<ResolvedObjectiveInstanceArchive[]>(
    "study_graph_resolve_objective_instance_archive",
    { p_instance_id: instanceId, p_learner_id: learnerId },
  );
  return rows[0] ?? null;
}
