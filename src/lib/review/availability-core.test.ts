import assert from "node:assert/strict";
import test from "node:test";
import { summarizeReviewAvailability, unavailableReviewAvailability, type ScheduleObservation } from "./availability-core.ts";

const now = Date.parse("2026-10-07T10:00:00Z");
const objectives = [{ kind: "objective" as const, id: "one", epoch: 1 }, { kind: "objective" as const, id: "two", epoch: 1 }];
const state = (id: string, due: number, project = "philosophy", epoch = 1): ScheduleObservation => ({ project_id: project, objective_id: id, srs_epoch: epoch, due_at: new Date(due).toISOString() });
const base = { projectId: "philosophy", objectives, legacy: [], objectiveStates: [], legacyReady: true, sessionSize: 12, pausedObjectives: false, now };

test("unseen and due are separate; equality at the deadline is due", () => {
  const result = summarizeReviewAvailability({ ...base, objectiveStates: [state("one", now)] });
  assert.equal(result.due, 1); assert.equal(result.new, 1); assert.equal(result.status, "ready");
});
test("future state is excluded and the earliest next date is retained", () => {
  const result = summarizeReviewAvailability({ ...base, objectiveStates: [state("one", now + 2000), state("two", now + 1000)] });
  assert.equal(result.due, 0); assert.equal(result.new, 0); assert.equal(result.nextDueAt, new Date(now + 1000).toISOString());
});
test("legacy state cannot make an Objective due or hide an unseen Objective", () => {
  const result = summarizeReviewAvailability({ ...base, objectiveStates: [state("one", now + 2000)],
    legacy: [{ candidate: { kind: "legacy", id: "one" }, dueAt: new Date(now - 1000).toISOString() }] });
  assert.equal(result.due, 1); assert.equal(result.new, 1);
});
test("another project or epoch is not the active schedule", () => {
  const result = summarizeReviewAvailability({ ...base, objectiveStates: [state("one", now, "western-art-history"), state("two", now, "philosophy", 2)] });
  assert.equal(result.due, 0); assert.equal(result.new, 2);
});
test("missing RPC and malformed dates remain unknown, never all unseen or zero due", () => {
  for (const rows of [null, [{ ...state("one", now), due_at: "broken" }]]) {
    const result = summarizeReviewAvailability({ ...base, objectiveStates: rows });
    assert.equal(result.status, "unavailable"); assert.equal(result.due, null); assert.equal(result.new, null); assert.equal(result.nextDueAt, null);
  }
  assert.equal(unavailableReviewAvailability().new, null);
});
test("session capacity follows curriculum order before legacy due items", () => {
  const result = summarizeReviewAvailability({ ...base, sessionSize: 2, objectiveStates: [state("two", now)],
    legacy: [{ candidate: { kind: "legacy", id: "old" }, dueAt: new Date(now).toISOString() }] });
  assert.equal(result.new, 1); assert.equal(result.due, 1);
});
test("legacy fallback is visibly unsaved practice, without an authoritative count", () => {
  const result = summarizeReviewAvailability({ ...base, objectives: [], legacyReady: false,
    legacy: [{ candidate: { kind: "legacy", id: "old" }, dueAt: null }] });
  assert.equal(result.status, "unavailable"); assert.equal(result.due, null); assert.equal(result.practice, 1);
});
test("disabled issuance is different from no due problems and may coexist with legacy", () => {
  const paused = summarizeReviewAvailability({ ...base, objectives: [], pausedObjectives: true });
  assert.equal(paused.status, "paused");
  const mixed = summarizeReviewAvailability({ ...base, objectives: [], pausedObjectives: true,
    legacy: [{ candidate: { kind: "legacy", id: "old" }, dueAt: null }] });
  assert.equal(mixed.status, "ready"); assert.equal(mixed.new, 1); assert.equal(mixed.pausedObjectives, true);
});
test("empty eligible scope does not require a schedule observation", () => {
  const result = summarizeReviewAvailability({ ...base, objectives: [], objectiveStates: null });
  assert.equal(result.status, "ready"); assert.equal(result.due, 0); assert.equal(result.new, 0);
});
