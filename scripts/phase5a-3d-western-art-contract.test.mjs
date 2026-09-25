import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const registry = read("src/lib/review/registry.ts");
const dispatch = read("src/lib/review/pilot-attempt-dispatch.ts");
const runtime = read("src/lib/review/western-art-pilot-runtime.ts");
const content = read("src/lib/review/exercises/western-art-cromlech.ts");

test("Art Objective authority is selected before legacy scheduling", () => {
  assert.ok(registry.indexOf("legacyEligibleIds.delete(westernArtObjective.scopeSubjectId)") < registry.indexOf("const dueTracked ="));
  assert.match(registry, /\.\.\.philosophyCards, \.\.\.legacyCards/);
  assert.match(registry, /\.\.\.westernArtCards, \.\.\.legacyCards/);
  assert.match(registry, /\.slice\(0, project\.review\.sessionSize\)/);
  assert.match(runtime, /objective_not_due|issueObjectiveInstanceV2/);
  assert.match(content, /acceptedAnswers: \["クロムレック"\]/);
});

test("Receipt-first recovery precedes persisted project dispatch", () => {
  assert.ok(dispatch.indexOf("recoverAcceptedPilotAttempt(request)") < dispatch.indexOf("resolveObjectiveInstanceArchive("));
  assert.match(dispatch, /persisted\.project_id === "western-art-history"/);
  assert.match(dispatch, /getWesternArtObjectiveByExerciseId\(persisted\.exercise_id\)/);
  assert.doesNotMatch(dispatch, /request\.projectId|body\.projectId/);
});

test("migration and durable offline protocol inventories are unchanged", () => {
  assert.equal(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).length, 21);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
  assert.doesNotMatch(runtime, /p_srs_plan|study_graph_record_review/);
});
