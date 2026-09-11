import type { ScopeKnowledgeSnapshot } from "../review/offline/snapshot-content.ts";
import type { ProjectReadState, SupportedProjectReadSnapshot } from "./read-contract.ts";
import { adaptScopeKnowledgeSnapshot, decodeProjectReadSnapshot } from "./read-contract.ts";

export type SnapshotBackedProjectId = "western-art-history" | "philosophy";
export type SnapshotBackedProjectReadSnapshot =
  | (SupportedProjectReadSnapshot & { projectId: "western-art-history" })
  | (SupportedProjectReadSnapshot & { projectId: "philosophy" });
export type SnapshotBackedProjectReadState = ProjectReadState<SnapshotBackedProjectReadSnapshot>;

export function isSnapshotBackedProjectId(value: string): value is SnapshotBackedProjectId {
  return value === "western-art-history" || value === "philosophy";
}

function dataStatus(snapshot: SnapshotBackedProjectReadSnapshot): "available" | "authoritative-empty" {
  const entityCounts = snapshot.projectId === "western-art-history"
    ? [snapshot.projection.lectures.length, snapshot.projection.artists.length, snapshot.projection.artworks.length, snapshot.projection.movements.length, snapshot.projection.terms.length, snapshot.projection.periods.length, snapshot.projection.culture.length, snapshot.projection.museums.length]
    : [snapshot.projection.lectures.length, snapshot.projection.philosophers.length, snapshot.projection.terms.length, snapshot.projection.problems.length, snapshot.projection.works.length, snapshot.projection.culture.length, snapshot.projection.periods.length, snapshot.projection.thoughtNotes.length];
  return entityCounts.some((count) => count > 0) ? "available" : "authoritative-empty";
}

/** True only for a verified snapshot that can safely be rendered. */
export function isRenderableProjectReadState(state: SnapshotBackedProjectReadState): state is Extract<SnapshotBackedProjectReadState, { kind: "ready" | "stale" | "verified-local-replica" }> {
  return state.kind === "ready" || state.kind === "stale" || state.kind === "verified-local-replica";
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
    if (decoded.projectId !== projectId || (decoded.projectId === "western-art-history" && decoded.projectionVersion !== "western-art-history-v1") || (decoded.projectId === "philosophy" && decoded.projectionVersion !== "philosophy-v1")) {
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
