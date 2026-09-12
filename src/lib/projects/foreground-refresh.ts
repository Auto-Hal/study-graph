import "server-only";

import { syncKuzushijiScopeKnowledgeSnapshot } from "../review/snapshot-sync/kuzushiji.ts";
import { syncPhilosophySnapshot, syncWesternArtHistorySnapshot } from "../review/snapshot-sync/projects.ts";
import { loadProjectReadState } from "./read-runtime.ts";
import {
  isSnapshotRefreshProjectId,
  runProjectSnapshotRefreshWithDependencies,
  SNAPSHOT_REFRESH_PROJECT_IDS,
  type SnapshotRefreshDependencies,
  type SnapshotRefreshIntent,
  type SnapshotRefreshProjectId,
  type SnapshotRefreshResult,
} from "./foreground-refresh-core.ts";

export {
  decideSnapshotRefresh,
  isSnapshotRefreshProjectId,
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  runProjectSnapshotRefreshWithDependencies,
  SNAPSHOT_REFRESH_PROJECT_IDS,
} from "./foreground-refresh-core.ts";
export type {
  SnapshotRefreshDecision,
  SnapshotRefreshDependencies,
  SnapshotRefreshIntent,
  SnapshotRefreshKind,
  SnapshotRefreshProjectId,
  SnapshotRefreshResult,
} from "./foreground-refresh-core.ts";

const defaultPublishers: Record<SnapshotRefreshProjectId, () => Promise<unknown>> = {
  kuzushiji: async () => syncKuzushijiScopeKnowledgeSnapshot(),
  "western-art-history": async () => syncWesternArtHistorySnapshot(),
  philosophy: async () => syncPhilosophySnapshot(),
};

/**
 * Server-only shared orchestration. It reads the current verified snapshot
 * before allowing one of the existing allowlisted publishers to run.
 */
export async function runProjectSnapshotRefresh(
  projectId: SnapshotRefreshProjectId,
  intent: SnapshotRefreshIntent,
  overrides: Pick<SnapshotRefreshDependencies, "now" | "manualCooldownMs"> = {},
): Promise<SnapshotRefreshResult> {
  if (!isSnapshotRefreshProjectId(projectId)) return { projectId, kind: "unavailable" };
  return runProjectSnapshotRefreshWithDependencies(projectId, intent, {
    loadState: loadProjectReadState,
    publishers: defaultPublishers,
    ...overrides,
  });
}
