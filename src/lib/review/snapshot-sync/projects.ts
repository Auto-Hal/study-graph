import "server-only";

import { randomUUID } from "node:crypto";
import { readPhilosophySnapshotSource } from "../../notion/philosophy-snapshot-source";
import { readWesternArtHistorySnapshotSource } from "../../notion/western-art-history-snapshot-source";
import {
  beginScopeSnapshotSync,
  failScopeSnapshotSync,
  publishScopeKnowledgeSnapshot,
  type BeginScopeSnapshotSyncResult,
  type PublishedScopeSnapshotResult,
} from "../../supabase/snapshots";
import {
  createPhilosophyScopeKnowledgeSnapshot,
  createWesternArtHistoryScopeKnowledgeSnapshot,
} from "./project-model";

export type PublishableProjectId = "western-art-history" | "philosophy";

export type ProjectSnapshotSyncResult = Readonly<{
  projectId: PublishableProjectId;
  runId: string;
  generation: number;
  snapshotId: string;
  contentHash: string;
  published: PublishedScopeSnapshotResult;
}>;

function isPublishableProjectId(value: string): value is PublishableProjectId {
  return value === "western-art-history" || value === "philosophy";
}

function failureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120) || "snapshot-sync-failed";
  }
  return "snapshot-sync-failed";
}

function failureDetail(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.slice(0, 500);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Server-only publisher dispatcher. The project allowlist is explicit so a
 * browser cannot select arbitrary Notion data sources or project IDs.
 * Nothing calls this helper from learner routes in this slice.
 */
export async function syncProjectKnowledgeSnapshot(projectId: string): Promise<ProjectSnapshotSyncResult> {
  if (!isPublishableProjectId(projectId)) throw new Error(`unsupported snapshot publisher project: ${projectId}`);
  const runId = randomUUID();
  let begin: BeginScopeSnapshotSyncResult | null = null;
  try {
    begin = await beginScopeSnapshotSync({ projectId, runId });
    const sourceReadStartedAt = nowIso();
    let sourceReadCompletedAt: string;
    let snapshot;
    if (projectId === "western-art-history") {
      const source = await readWesternArtHistorySnapshotSource();
      sourceReadCompletedAt = nowIso();
      snapshot = createWesternArtHistoryScopeKnowledgeSnapshot({
        source,
        snapshotId: randomUUID(),
        generation: begin.generation,
        sourceReadStartedAt,
        sourceReadCompletedAt,
        publishedAt: nowIso(),
      });
    } else {
      const source = await readPhilosophySnapshotSource();
      sourceReadCompletedAt = nowIso();
      snapshot = createPhilosophyScopeKnowledgeSnapshot({
        source,
        snapshotId: randomUUID(),
        generation: begin.generation,
        sourceReadStartedAt,
        sourceReadCompletedAt,
        publishedAt: nowIso(),
      });
    }
    const published = await publishScopeKnowledgeSnapshot(snapshot, { projectId, runId });
    return {
      projectId,
      runId,
      generation: snapshot.generation,
      snapshotId: snapshot.snapshotId,
      contentHash: snapshot.contentHash,
      published,
    };
  } catch (error) {
    if (begin) {
      try {
        await failScopeSnapshotSync({
          projectId,
          runId,
          errorCode: failureCode(error),
          errorDetail: failureDetail(error),
        });
      } catch (failureError) {
        console.error("Study Graph: project snapshot failure health update failed", failureError);
      }
    }
    throw error;
  }
}

export function syncWesternArtHistorySnapshot() {
  return syncProjectKnowledgeSnapshot("western-art-history");
}

export function syncPhilosophySnapshot() {
  return syncProjectKnowledgeSnapshot("philosophy");
}
