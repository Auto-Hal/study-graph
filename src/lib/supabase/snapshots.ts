import "server-only";

import {
  assertValidScopeKnowledgeSnapshot,
  isScopeKnowledgeSnapshotHashValid,
  type ScopeKnowledgeSnapshot,
} from "@/src/lib/review/offline/snapshot";

const DEFAULT_SUPABASE_URL = "https://uhckdhdkywhsqjcquvyj.supabase.co";

export type SnapshotRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
};

export class SnapshotRpcError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "SnapshotRpcError";
    this.code = code;
    this.status = status;
  }
}

export type BeginScopeSnapshotSyncResult = {
  project_id: string;
  run_id: string;
  generation: number;
  lease_until: string;
};

export type PublishedScopeSnapshotResult = {
  snapshot_id: string;
  project_id: string;
  generation: number;
  content_hash: string;
};

export type FailedScopeSnapshotSyncResult = {
  project_id: string;
  run_id: string;
  recorded: boolean;
};

export function getSnapshotRuntimeConfig(): SnapshotRuntimeConfig | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;
  return {
    url: (process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    serviceRoleKey,
  };
}

function extractErrorCode(message: string) {
  const known = /(?:snapshot_sync_in_progress|snapshot_sync_lease_expired|snapshot_publish_conflict|snapshot_publish_stale|snapshot_run_mismatch|snapshot_generation_mismatch|invalid_[a-z_]+|unsupported_[a-z_]+)/.exec(message);
  return known?.[0] ?? null;
}

async function callSnapshotRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const config = getSnapshotRuntimeConfig();
  if (!config) throw new SnapshotRpcError("snapshot_sync_not_configured", 503, "snapshot_sync_not_configured");
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
    let message = bodyText || `Supabase snapshot RPC ${name} failed (${response.status})`;
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; details?: string; hint?: string };
      message = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(" ") || message;
    } catch {
      // Keep the raw response when PostgREST did not return JSON.
    }
    throw new SnapshotRpcError(message, response.status, extractErrorCode(message));
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new SnapshotRpcError(`Supabase snapshot RPC ${name} returned invalid JSON`, 502, "malformed-response");
  }
}

function firstRow<T>(rows: T[], name: string): T {
  const row = rows[0];
  if (!row) throw new SnapshotRpcError(`Supabase snapshot RPC ${name} returned no row`, 502, "empty-rpc-result");
  return row;
}

export async function beginScopeSnapshotSync(input: {
  projectId: string;
  runId: string;
}): Promise<BeginScopeSnapshotSyncResult> {
  return firstRow(
    await callSnapshotRpc<BeginScopeSnapshotSyncResult[]>("study_graph_begin_scope_snapshot_sync", {
      p_project_id: input.projectId,
      p_run_id: input.runId,
    }),
    "study_graph_begin_scope_snapshot_sync",
  );
}

export async function publishScopeKnowledgeSnapshot(
  snapshot: ScopeKnowledgeSnapshot,
  input: { projectId: string; runId: string },
): Promise<PublishedScopeSnapshotResult> {
  return firstRow(
    await callSnapshotRpc<PublishedScopeSnapshotResult[]>("study_graph_publish_scope_knowledge_snapshot", {
      p_snapshot_id: snapshot.snapshotId,
      p_project_id: input.projectId,
      p_run_id: input.runId,
      p_generation: snapshot.generation,
      p_schema_version: snapshot.schemaVersion,
      p_source_read_started_at: snapshot.sourceReadStartedAt,
      p_source_read_completed_at: snapshot.sourceReadCompletedAt,
      p_published_at: snapshot.publishedAt,
      p_valid_until: snapshot.validUntil,
      p_scope_policy_version: snapshot.scopePolicyVersion,
      p_knowledge_projection_version: snapshot.knowledgeProjectionVersion,
      p_source_evidence: snapshot.sourceEvidence,
      p_scope_decisions: snapshot.scopeDecisions,
      p_knowledge_projection: snapshot.knowledgeProjection,
      p_content_hash: snapshot.contentHash,
    }),
    "study_graph_publish_scope_knowledge_snapshot",
  );
}

export async function failScopeSnapshotSync(input: {
  projectId: string;
  runId: string;
  errorCode: string;
  errorDetail: string;
}): Promise<FailedScopeSnapshotSyncResult> {
  return firstRow(
    await callSnapshotRpc<FailedScopeSnapshotSyncResult[]>("study_graph_fail_scope_snapshot_sync", {
      p_project_id: input.projectId,
      p_run_id: input.runId,
      p_error_code: input.errorCode,
      p_error_detail: input.errorDetail,
    }),
    "study_graph_fail_scope_snapshot_sync",
  );
}

/** Raw snake_case row returned by the server-only PostgREST read boundary. */
export type CurrentScopeKnowledgeSnapshotRow = {
  snapshot_id: string;
  project_id: string;
  generation: number;
  schema_version: number;
  source_read_started_at: string;
  source_read_completed_at: string;
  published_at: string;
  valid_until: string;
  scope_policy_version: string;
  knowledge_projection_version: string;
  source_evidence: ScopeKnowledgeSnapshot["sourceEvidence"];
  scope_decisions: ScopeKnowledgeSnapshot["scopeDecisions"];
  knowledge_projection: ScopeKnowledgeSnapshot["knowledgeProjection"];
  content_hash: string;
  created_at: string;
};

export async function getCurrentScopeKnowledgeSnapshot(projectId: string): Promise<CurrentScopeKnowledgeSnapshotRow | null> {
  const rows = await callSnapshotRpc<CurrentScopeKnowledgeSnapshotRow[]>("study_graph_get_current_scope_knowledge_snapshot", {
    p_project_id: projectId,
  });
  return rows[0] ?? null;
}

/**
 * Convert the private archive's snake_case row into the runtime-neutral
 * snapshot model. The server never repairs an incomplete row from Notion or
 * from the current request; an invalid archive is a fail-closed error.
 */
export function mapCurrentScopeKnowledgeSnapshotRow(value: unknown): ScopeKnowledgeSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SnapshotRpcError("snapshot_invalid", 502, "snapshot_invalid");
  }
  const row = value as Record<string, unknown>;
  const snapshot = {
    snapshotId: row.snapshot_id,
    projectId: row.project_id,
    generation: row.generation,
    schemaVersion: row.schema_version,
    sourceReadStartedAt: row.source_read_started_at,
    sourceReadCompletedAt: row.source_read_completed_at,
    publishedAt: row.published_at,
    validUntil: row.valid_until,
    scopePolicyVersion: row.scope_policy_version,
    knowledgeProjectionVersion: row.knowledge_projection_version,
    sourceEvidence: row.source_evidence,
    scopeDecisions: row.scope_decisions,
    knowledgeProjection: row.knowledge_projection,
    contentHash: row.content_hash,
  } as unknown;
  try {
    assertValidScopeKnowledgeSnapshot(snapshot);
    if (!isScopeKnowledgeSnapshotHashValid(snapshot)) throw new Error("snapshot content hash mismatch");
    return snapshot;
  } catch {
    throw new SnapshotRpcError("snapshot_invalid", 502, "snapshot_invalid");
  }
}

/** Server-only model boundary used by the authenticated distribution route. */
export async function getCurrentScopeKnowledgeSnapshotModel(projectId: string): Promise<ScopeKnowledgeSnapshot | null> {
  const row = await getCurrentScopeKnowledgeSnapshot(projectId);
  return row ? mapCurrentScopeKnowledgeSnapshotRow(row) : null;
}
