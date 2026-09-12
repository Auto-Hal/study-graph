import type { ScopeKnowledgeSnapshot } from "../review/offline/snapshot-content.ts";
import type { ProjectReadState, SupportedProjectReadSnapshot } from "./read-contract.ts";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  KUZUSHIJI_PROJECT_ID,
  KUZUSHIJI_V2_PROJECTION_VERSION,
  PHILOSOPHY_PROJECT_ID,
  PHILOSOPHY_V1_PROJECTION_VERSION,
  WESTERN_ART_HISTORY_PROJECT_ID,
  WESTERN_ART_HISTORY_V1_PROJECTION_VERSION,
} from "./read-contract.ts";

export type SnapshotBackedProjectId = "kuzushiji" | "western-art-history" | "philosophy";
export type SnapshotBackedProjectReadSnapshot =
  | Extract<SupportedProjectReadSnapshot, { projectId: "kuzushiji"; projectionVersion: "kuzushiji-v2" }>
  | Extract<SupportedProjectReadSnapshot, { projectId: "western-art-history"; projectionVersion: "western-art-history-v1" }>
  | Extract<SupportedProjectReadSnapshot, { projectId: "philosophy"; projectionVersion: "philosophy-v1" }>;
export type SnapshotBackedProjectReadState = ProjectReadState<SnapshotBackedProjectReadSnapshot>;
export type KuzushijiV2ProjectReadSnapshot = Extract<
  SnapshotBackedProjectReadSnapshot,
  { projectId: "kuzushiji"; projectionVersion: "kuzushiji-v2" }
>;
export type KuzushijiV2ProjectReadState =
  | { kind: "ready"; data: KuzushijiV2ProjectReadSnapshot; dataStatus: "available" | "authoritative-empty" }
  | { kind: "stale"; data: KuzushijiV2ProjectReadSnapshot; dataStatus: "available" | "authoritative-empty"; staleSince?: string }
  | { kind: "verified-local-replica"; data: KuzushijiV2ProjectReadSnapshot; dataStatus: "available" | "authoritative-empty" };

export function isSnapshotBackedProjectId(value: string): value is SnapshotBackedProjectId {
  return value === KUZUSHIJI_PROJECT_ID || value === WESTERN_ART_HISTORY_PROJECT_ID || value === PHILOSOPHY_PROJECT_ID;
}

function dataStatus(snapshot: SnapshotBackedProjectReadSnapshot): "available" | "authoritative-empty" {
  const entityCounts = snapshot.projectId === KUZUSHIJI_PROJECT_ID
    ? [snapshot.projection.lectures.length, snapshot.projection.characters.length, snapshot.projection.mistakes.length, snapshot.projection.sources.length, snapshot.projection.expressions.length]
    : snapshot.projectId === WESTERN_ART_HISTORY_PROJECT_ID
      ? [snapshot.projection.lectures.length, snapshot.projection.artists.length, snapshot.projection.artworks.length, snapshot.projection.movements.length, snapshot.projection.terms.length, snapshot.projection.periods.length, snapshot.projection.culture.length, snapshot.projection.museums.length]
      : [snapshot.projection.lectures.length, snapshot.projection.philosophers.length, snapshot.projection.terms.length, snapshot.projection.problems.length, snapshot.projection.works.length, snapshot.projection.culture.length, snapshot.projection.periods.length, snapshot.projection.thoughtNotes.length];
  return entityCounts.some((count) => count > 0) ? "available" : "authoritative-empty";
}

function isSupportedLearnerProjection(snapshot: SupportedProjectReadSnapshot, projectId: SnapshotBackedProjectId) {
  return snapshot.projectId === projectId && (
    (projectId === KUZUSHIJI_PROJECT_ID && snapshot.projectionVersion === KUZUSHIJI_V2_PROJECTION_VERSION)
    || (projectId === WESTERN_ART_HISTORY_PROJECT_ID && snapshot.projectionVersion === WESTERN_ART_HISTORY_V1_PROJECTION_VERSION)
    || (projectId === PHILOSOPHY_PROJECT_ID && snapshot.projectionVersion === PHILOSOPHY_V1_PROJECTION_VERSION)
  );
}

/** True only for a verified snapshot that can safely be rendered. */
export function isRenderableProjectReadState(state: SnapshotBackedProjectReadState): state is Extract<SnapshotBackedProjectReadState, { kind: "ready" | "stale" | "verified-local-replica" }> {
  return state.kind === "ready" || state.kind === "stale" || state.kind === "verified-local-replica";
}

export function isKuzushijiV2ProjectReadState(state: SnapshotBackedProjectReadState): state is KuzushijiV2ProjectReadState {
  return isRenderableProjectReadState(state)
    && state.data.projectId === KUZUSHIJI_PROJECT_ID
    && state.data.projectionVersion === KUZUSHIJI_V2_PROJECTION_VERSION;
}

function invalidSnapshotState(error: unknown): SnapshotBackedProjectReadState {
  const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "snapshot-invalid";
  return { kind: "invalid-candidate", errorCode };
}

/**
 * Pure projection of a validated current-row candidate into the shared read
 * state grammar.  It performs no refresh or fallback and treats validUntil as
 * display freshness only.
 */
export function decodeStoredProjectReadState(
  projectId: string,
  stored: ScopeKnowledgeSnapshot | null,
  now = Date.now(),
): SnapshotBackedProjectReadState {
  if (!isSnapshotBackedProjectId(projectId)) return { kind: "unavailable", errorCode: "unsupported-project" };
  if (!stored) return { kind: "missing", reason: "not-yet-published" };

  try {
    const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(stored));
    if (!isSupportedLearnerProjection(decoded, projectId)) {
      return { kind: "invalid-candidate", errorCode: "project-projection-mismatch" };
    }
    const typed = decoded as SnapshotBackedProjectReadSnapshot;
    const validUntil = Date.parse(typed.validUntil);
    return Number.isFinite(validUntil) && validUntil <= now
      ? { kind: "stale", data: typed, dataStatus: dataStatus(typed), staleSince: typed.validUntil }
      : { kind: "ready", data: typed, dataStatus: dataStatus(typed) };
  } catch (error) {
    return invalidSnapshotState(error);
  }
}
