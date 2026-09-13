import type { SnapshotBackedProjectReadState } from "./read-runtime-core.ts";

export const SNAPSHOT_REFRESH_PROJECT_IDS = [
  "kuzushiji",
  "western-art-history",
  "philosophy",
] as const;

export type SnapshotRefreshProjectId = (typeof SNAPSHOT_REFRESH_PROJECT_IDS)[number];
export type SnapshotRefreshIntent = "foreground" | "manual";
export type SnapshotRefreshKind =
  | "fresh"
  | "refreshed"
  | "cooldown"
  | "busy"
  | "missing"
  | "blocked"
  | "unavailable";

export type SnapshotRefreshResult = Readonly<{
  projectId: SnapshotRefreshProjectId;
  kind: SnapshotRefreshKind;
}>;

/** Manual refreshes are intentionally bounded without adding persistent state. */
export const MANUAL_REFRESH_MIN_INTERVAL_MS = 90_000;

type RenderableState = Extract<
  SnapshotBackedProjectReadState,
  { kind: "ready" | "stale" | "verified-local-replica" }
>;

export type SnapshotRefreshDependencies = Readonly<{
  loadState: (projectId: SnapshotRefreshProjectId) => Promise<SnapshotBackedProjectReadState>;
  publishers: Partial<Record<SnapshotRefreshProjectId, () => Promise<unknown>>>;
  now?: () => number;
  manualCooldownMs?: number;
}>;

export function isSnapshotRefreshProjectId(value: string): value is SnapshotRefreshProjectId {
  return (SNAPSHOT_REFRESH_PROJECT_IDS as readonly string[]).includes(value);
}

function isRenderableState(state: SnapshotBackedProjectReadState): state is RenderableState {
  return state.kind === "ready" || state.kind === "stale" || state.kind === "verified-local-replica";
}

export type SnapshotRefreshDecision = SnapshotRefreshKind | "publish";

/**
 * Decide whether a bounded foreground/manual request may invoke a publisher.
 * Snapshot freshness is display metadata only; this policy never participates
 * in Scope, Objective, or SRS decisions.
 */
export function decideSnapshotRefresh(
  state: SnapshotBackedProjectReadState,
  intent: SnapshotRefreshIntent,
  now = Date.now(),
  manualCooldownMs = MANUAL_REFRESH_MIN_INTERVAL_MS,
): SnapshotRefreshDecision {
  if (state.kind === "invalid-candidate" || state.kind === "conflict") return "blocked";
  if (state.kind === "missing") return intent === "manual" ? "publish" : "missing";
  if (!isRenderableState(state)) return "unavailable";

  if (intent === "foreground") return state.kind === "stale" ? "publish" : "fresh";

  const publishedAt = Date.parse(state.data.publishedAt);
  if (Number.isFinite(publishedAt) && now - publishedAt < manualCooldownMs) return "cooldown";
  return "publish";
}

function publisherErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return null;
}

/** Testable orchestration core; the server adapter supplies the real readers/publishers. */
export async function runProjectSnapshotRefreshWithDependencies(
  projectId: SnapshotRefreshProjectId,
  intent: SnapshotRefreshIntent,
  dependencies: SnapshotRefreshDependencies,
): Promise<SnapshotRefreshResult> {
  let state: SnapshotBackedProjectReadState | null = null;
  try {
    state = await dependencies.loadState(projectId);
  } catch {
    // Read failures are deliberately local to refresh orchestration.
  }
  if (!state) return { projectId, kind: "unavailable" };

  const decision = decideSnapshotRefresh(
    state,
    intent,
    dependencies.now?.() ?? Date.now(),
    dependencies.manualCooldownMs ?? MANUAL_REFRESH_MIN_INTERVAL_MS,
  );
  if (decision !== "publish") return { projectId, kind: decision };

  const publisher = dependencies.publishers[projectId];
  if (!publisher) return { projectId, kind: "unavailable" };
  try {
    await publisher();
    return { projectId, kind: "refreshed" };
  } catch (error) {
    if (publisherErrorCode(error) === "snapshot_sync_in_progress") return { projectId, kind: "busy" };
    if (publisherErrorCode(error) === "snapshot_publish_conflict") return { projectId, kind: "blocked" };
    return { projectId, kind: "unavailable" };
  }
}
