export type ScheduleObservation = Readonly<{
  project_id: string;
  objective_id: string;
  srs_epoch: number;
  due_at: string;
}>;

export type ReviewCandidate = Readonly<{
  kind: "objective" | "legacy";
  id: string;
  epoch?: number;
}>;

export type ReviewAvailability = Readonly<{
  status: "ready" | "unavailable" | "paused";
  due: number | null;
  new: number | null;
  practice: number;
  nextDueAt: string | null;
  pausedObjectives: boolean;
}>;

export function unavailableReviewAvailability(): ReviewAvailability {
  return { status: "unavailable", due: null, new: null, practice: 0, nextDueAt: null, pausedObjectives: false };
}

/** Same curriculum order and session cap as the issuer. Unknown is never unseen. */
export function summarizeReviewAvailability(input: {
  projectId: string;
  objectives: readonly ReviewCandidate[];
  legacy: readonly { candidate: ReviewCandidate; dueAt: string | null }[];
  objectiveStates: readonly ScheduleObservation[] | null;
  legacyReady: boolean;
  sessionSize: number;
  pausedObjectives: boolean;
  now: number;
}): ReviewAvailability {
  const result: Array<"due" | "new" | "practice"> = [];
  const future: number[] = [];
  let unknown = input.objectives.length > 0 && input.objectiveStates === null;
  const states = new Map((input.objectiveStates ?? [])
    .filter((row) => row.project_id === input.projectId)
    .map((row) => [JSON.stringify([row.objective_id, row.srs_epoch]), row]));
  for (const target of input.objectives) {
    if (input.objectiveStates === null) continue;
    const state = states.get(JSON.stringify([target.id, target.epoch]));
    if (!state) { result.push("new"); continue; }
    const due = Date.parse(state.due_at);
    if (!Number.isFinite(due)) { unknown = true; continue; }
    if (due <= input.now) result.push("due"); else future.push(due);
  }
  for (const { dueAt } of input.legacy) {
    if (!input.legacyReady) { result.push("practice"); unknown = true; continue; }
    if (dueAt === null) { result.push("new"); continue; }
    const due = Date.parse(dueAt);
    if (!Number.isFinite(due)) { unknown = true; continue; }
    if (due <= input.now) result.push("due"); else future.push(due);
  }
  const selected = result.slice(0, input.sessionSize);
  return {
    status: unknown ? "unavailable" : input.pausedObjectives && selected.length === 0 ? "paused" : "ready",
    due: unknown ? null : selected.filter((kind) => kind === "due").length,
    new: unknown ? null : selected.filter((kind) => kind === "new").length,
    practice: selected.filter((kind) => kind === "practice").length,
    nextDueAt: !unknown && future.length > 0 ? new Date(Math.min(...future)).toISOString() : null,
    pausedObjectives: input.pausedObjectives,
  };
}
