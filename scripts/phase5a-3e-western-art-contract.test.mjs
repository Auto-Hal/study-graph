import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const registry = read("src/lib/review/registry.ts");
const runtime = read("src/lib/review/western-art-pilot-runtime.ts");
const dispatcher = read("src/lib/review/pilot-attempt-dispatch.ts");
const trusted = read("src/lib/review/western-art-objective-registry.ts");

test("all Art Scope subjects are removed before legacy due/unseen selection", () => {
  assert.ok(registry.indexOf("westernArtObjectiveScopeSubjectIds") < registry.indexOf("const dueTracked ="));
  assert.ok(registry.indexOf("legacyEligibleIds.delete(id)") < registry.indexOf("const dueTracked ="));
  assert.match(registry, /\.\.\.westernArtCards, \.\.\.legacyCards/);
  assert.match(registry, /\.slice\(0, project\.review\.sessionSize\)/);
  assert.match(runtime, /for \(const entry of westernArtObjectiveRegistry\)/);
  assert.match(runtime, /objective_not_due/);
  assert.match(runtime, /decoded\.entry\.exerciseId !== entry\.exerciseId/);
  assert.match(trusted, /westernArtObjectiveRegistry\.find\(\(entry\) => entry\.exerciseId === exerciseId\)/);
});

test("Receipt recovery precedes server-owned persisted identity dispatch", () => {
  assert.ok(dispatcher.indexOf("recoverAcceptedPilotAttempt(request)") < dispatcher.indexOf("resolveObjectiveInstanceArchive("));
  assert.match(dispatcher, /getWesternArtObjectiveByExerciseId\(persisted\.exercise_id\)/);
  assert.doesNotMatch(dispatcher, /request\.projectId|body\.projectId/);
  assert.doesNotMatch(runtime, /study_graph_record_review|p_srs_plan/);
});

test("migration and durable offline inventories remain unchanged", () => {
  assert.equal(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).length, 21);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
});
