import "server-only";

import { randomUUID } from "node:crypto";
import { readKuzushijiSnapshotSource } from "@/src/lib/notion/kuzushiji-snapshot-source";
import {
  beginScopeSnapshotSync,
  failScopeSnapshotSync,
  publishScopeKnowledgeSnapshot,
  type BeginScopeSnapshotSyncResult,
  type PublishedScopeSnapshotResult,
} from "@/src/lib/supabase/snapshots";
import {
  createKuzushijiScopeKnowledgeSnapshot,
  KUZUSHIJI_SNAPSHOT_PROJECT_ID,
} from "./model";

export type KuzushijiSnapshotSyncResult = {
  runId: string;
  generation: number;
  snapshotId: string;
  contentHash: string;
  published: PublishedScopeSnapshotResult;
};

function failureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120) || "snapshot-sync-failed";
  }
  return "snapshot-sync-failed";
}

function failureDetail(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  // Error details are health metadata, not a place to persist credentials or
  // an unbounded response body.
  return detail.slice(0, 500);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Strict Kuzushiji snapshot sync primitive.  It is intentionally not called
 * by screen rendering, Review queue selection, or any browser route.
 */
export async function syncKuzushijiScopeKnowledgeSnapshot(): Promise<KuzushijiSnapshotSyncResult> {
  const runId = randomUUID();
  let begin: BeginScopeSnapshotSyncResult | null = null;
  try {
    begin = await beginScopeSnapshotSync({ projectId: KUZUSHIJI_SNAPSHOT_PROJECT_ID, runId });
    const sourceReadStartedAt = nowIso();
    const source = await readKuzushijiSnapshotSource();
    const sourceReadCompletedAt = nowIso();
    const snapshot = createKuzushijiScopeKnowledgeSnapshot({
      source,
      snapshotId: randomUUID(),
      generation: begin.generation,
      sourceReadStartedAt,
      sourceReadCompletedAt,
      publishedAt: nowIso(),
    });
    const published = await publishScopeKnowledgeSnapshot(snapshot, {
      projectId: KUZUSHIJI_SNAPSHOT_PROJECT_ID,
      runId,
    });
    return {
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
          projectId: KUZUSHIJI_SNAPSHOT_PROJECT_ID,
          runId,
          errorCode: failureCode(error),
          errorDetail: failureDetail(error),
        });
      } catch (failureError) {
        // Preserve the source/publish error. The failed health update is
        // secondary and must never make the original cause disappear.
        console.error("Study Graph: snapshot failure health update failed", failureError);
      }
    }
    throw error;
  }
}
