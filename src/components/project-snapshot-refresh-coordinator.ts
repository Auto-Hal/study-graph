export type CoordinatorProjectId = "kuzushiji" | "western-art-history" | "philosophy";
export type CoordinatorIntent = "foreground" | "manual";
export type CoordinatorResultKind =
  | "fresh"
  | "refreshed"
  | "cooldown"
  | "busy"
  | "missing"
  | "blocked"
  | "unavailable";

export type CoordinatorResult = Readonly<{
  projectId: CoordinatorProjectId;
  kind: CoordinatorResultKind;
}>;

export type InFlightRefresh = Readonly<{
  projectId: CoordinatorProjectId;
  intent: CoordinatorIntent;
  promise: Promise<CoordinatorResult>;
}>;

export const FOREGROUND_REFRESH_THROTTLE_MS = 5 * 60 * 1_000;

type CoordinatorOptions = Readonly<{
  now?: () => number;
  foregroundThrottleMs?: number;
}>;

/**
 * Coordinates browser refresh requests without weakening the server policy.
 * The maps are deliberately per module instance (normally one browser tab).
 * A manual request that arrives during foreground work is represented by one
 * joined chain and can start a manual request after the foreground result
 * unless that result already refreshed the snapshot.
 */
export function createProjectSnapshotRefreshCoordinator(
  transport: (projectId: CoordinatorProjectId, intent: CoordinatorIntent) => Promise<CoordinatorResult>,
  options: CoordinatorOptions = {},
) {
  const inFlightRequests = new Map<CoordinatorProjectId, InFlightRefresh>();
  const foregroundRequestedAt = new Map<CoordinatorProjectId, number>();
  const now = options.now ?? Date.now;
  const foregroundThrottleMs = options.foregroundThrottleMs ?? FOREGROUND_REFRESH_THROTTLE_MS;

  function clearIfCurrent(entry: InFlightRefresh) {
    if (inFlightRequests.get(entry.projectId)?.promise === entry.promise) {
      inFlightRequests.delete(entry.projectId);
    }
  }

  function startDirect(projectId: CoordinatorProjectId, intent: CoordinatorIntent) {
    // Starting through a microtask also turns a synchronous transport throw
    // into a safe unavailable result and leaves the metadata visible before
    // the transport starts.
    const promise = Promise.resolve()
      .then(() => transport(projectId, intent))
      .catch(() => ({ projectId, kind: "unavailable" as const }))
      .finally(() => {
        const entry = inFlightRequests.get(projectId);
        if (entry?.promise === promise) inFlightRequests.delete(projectId);
      });
    const entry: InFlightRefresh = { projectId, intent, promise };
    inFlightRequests.set(projectId, entry);
    return promise;
  }

  function request(projectId: CoordinatorProjectId, intent: CoordinatorIntent): Promise<CoordinatorResult> {
    const existing = inFlightRequests.get(projectId);
    if (!existing) return startDirect(projectId, intent);

    // A manual operation is stronger than foreground work. Foreground
    // callers may observe it, but must never replace or downgrade it.
    if (existing.intent === "manual" || intent === "foreground") return existing.promise;

    // Manual during foreground: wait for the foreground result. A successful
    // publication satisfies the manual caller too; every other result gets a
    // single manual attempt after the foreground promise settles.
    const foregroundPromise = existing.promise;
    const promise = foregroundPromise
      .then((result) => result.kind === "refreshed" ? result : startDirect(projectId, "manual"))
      .finally(() => {
        const entry = inFlightRequests.get(projectId);
        if (entry?.promise === promise) inFlightRequests.delete(projectId);
      });
    inFlightRequests.set(projectId, { projectId, intent: "manual", promise });
    return promise;
  }

  function requestForeground(projectId: CoordinatorProjectId): Promise<CoordinatorResult> | null {
    // Joining an existing request happens before throttle evaluation. A new
    // route mount therefore receives the eventual refreshed result even when
    // the originating coordinator has unmounted.
    const existing = inFlightRequests.get(projectId);
    if (existing) return existing.promise;

    const currentTime = now();
    const lastRequestedAt = foregroundRequestedAt.get(projectId);
    if (lastRequestedAt !== undefined && currentTime - lastRequestedAt < foregroundThrottleMs) return null;

    foregroundRequestedAt.set(projectId, currentTime);
    return request(projectId, "foreground");
  }

  return {
    request,
    requestForeground,
    getInFlight: (projectId: CoordinatorProjectId) => inFlightRequests.get(projectId),
    getForegroundRequestedAt: (projectId: CoordinatorProjectId) => foregroundRequestedAt.get(projectId),
  };
}
