import "server-only";

import type { GraphData } from "../graph/types.ts";
import { projectReadSnapshotToGraph } from "./project-graph.ts";
import { getCurrentScopeKnowledgeSnapshotModel, SnapshotRpcError } from "../supabase/snapshots.ts";
import {
  decodeStoredProjectReadState,
  isKuzushijiV2ProjectReadState,
  isRenderableProjectReadState,
  isSnapshotBackedProjectId,
  type SnapshotBackedProjectId,
  type SnapshotBackedProjectReadState,
} from "./read-runtime-core.ts";

export { isKuzushijiV2ProjectReadState, isRenderableProjectReadState } from "./read-runtime-core.ts";
export type {
  KuzushijiV2ProjectReadSnapshot,
  KuzushijiV2ProjectReadState,
  SnapshotBackedProjectId,
  SnapshotBackedProjectReadState,
} from "./read-runtime-core.ts";

function errorCode(error: unknown) {
  if (error instanceof SnapshotRpcError && error.code) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return undefined;
}

/**
 * Server-only current snapshot read boundary for projects with a published
 * learner projection. No Notion fallback is attempted here. Kuzushiji accepts
 * only v2 on this normal learner path; its historical v1 remains available to
 * the global decoder and browser Home cache compatibility layer.
 */
export async function loadProjectReadState(projectId: string): Promise<SnapshotBackedProjectReadState> {
  if (!isSnapshotBackedProjectId(projectId)) return { kind: "unavailable", errorCode: "unsupported-project" };

  try {
    const stored = await getCurrentScopeKnowledgeSnapshotModel(projectId);
    return decodeStoredProjectReadState(projectId, stored);
  } catch (error) {
    return error instanceof SnapshotRpcError && error.code === "snapshot_invalid"
      ? { kind: "invalid-candidate", errorCode: errorCode(error) ?? "snapshot-invalid" }
      : { kind: "unavailable", errorCode: errorCode(error) };
  }
}

/** Convert a renderable decoded snapshot to its same-observation graph. */
export function projectReadStateToGraph(state: Extract<SnapshotBackedProjectReadState, { kind: "ready" | "stale" | "verified-local-replica" }>): GraphData {
  return projectReadSnapshotToGraph(state.data);
}

/**
 * Compatibility graph loader for existing server callers such as the review
 * registry.  Unavailable states remain visibly non-authoritative and never
 * become an empty learner dataset with a fake "zero" meaning.
 */
export async function loadSnapshotProjectGraph(projectId: SnapshotBackedProjectId): Promise<GraphData> {
  const state = await loadProjectReadState(projectId);
  if (isRenderableProjectReadState(state)) {
    return { ...projectReadStateToGraph(state), snapshotState: state.kind === "verified-local-replica" ? "ready" : state.kind };
  }
  const snapshotState = state.kind === "missing" || state.kind === "invalid-candidate" || state.kind === "conflict"
    ? state.kind
    : "unavailable";
  return {
    projectId,
    mode: "snapshot",
    snapshotState,
    scope: { sourceState: "unavailable", anchors: [] },
    nodes: [],
    edges: [],
  };
}
