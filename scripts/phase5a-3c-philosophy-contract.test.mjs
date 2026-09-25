import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const registry = read("src/lib/review/philosophy-objective-registry.ts");
const review = read("src/lib/review/registry.ts");
const dispatch = read("src/lib/review/pilot-attempt-dispatch.ts");
const runtime = read("src/lib/review/philosophy-pilot-runtime.ts");

test("trusted Objective order and legacy exclusion precede legacy scheduling", () => {
  const order = ["PHILOSOPHY_THALES_EXERCISE_ID", "PHILOSOPHY_ARCHE_EXERCISE_ID", "PHILOSOPHY_ANAXIMENES_EXERCISE_ID"];
  let last = -1;
  for (const id of order) {
    const next = registry.indexOf(`exerciseId: ${id}`);
    assert.ok(next > last);
    last = next;
  }
  assert.ok(review.indexOf("legacyEligibleIds.delete(id)") < review.indexOf("const dueTracked ="));
  assert.match(review, /\.\.\.philosophyCards, \.\.\.legacyCards/);
  assert.match(review, /\.slice\(0, project\.review\.sessionSize\)/);
  assert.match(runtime, /for \(const entry of philosophyObjectiveRegistry\)/);
  assert.match(runtime, /objective_not_due/);
});

test("accepted receipt is recovered before persisted project dispatch", () => {
  assert.ok(dispatch.indexOf("recoverAcceptedPilotAttempt(request)") < dispatch.indexOf("resolveObjectiveInstanceArchive("));
  assert.match(dispatch, /getPhilosophyObjectiveByExerciseId\(persisted\.exercise_id\)/);
  assert.doesNotMatch(dispatch, /request\.projectId|body\.projectId/);
});

test("this slice preserves migration and offline protocol inventory", () => {
  assert.equal(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).length, 21);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
  assert.doesNotMatch(runtime, /p_srs_plan|legacyReviewAttemptId/);
});
