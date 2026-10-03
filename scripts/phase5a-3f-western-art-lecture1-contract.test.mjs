import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const content = read("src/lib/review/exercises/western-art-prehistory-additions.ts");
const trusted = read("src/lib/review/western-art-objective-registry.ts");
const registry = read("src/lib/review/registry.ts");
const runtime = read("src/lib/review/western-art-pilot-runtime.ts");
const dispatcher = read("src/lib/review/pilot-attempt-dispatch.ts");

test("Lecture 1 uses real Notion sources and only the three approved text Objectives", () => {
  assert.match(content, /WESTERN_ART_LECTURE1_URL = "https:\/\/app\.notion\.com\/p\/3bdd2793413481058e0fc17980f50ec8"/);
  assert.match(content, /western-art-history\.paleolithic\.period-recall/);
  assert.match(content, /western-art-history\.exaggeration\.term-recall/);
  assert.match(content, /western-art-history\.abstraction\.term-recall/);
  assert.match(content, /createExerciseRevision\(definition, new Map<string, VisualAsset>\(\), null\)/);
  assert.match(content, /createContentRelease\(createContentReleaseManifest\(\[revision\]\)\)/);
  assert.doesNotMatch(content, /example\.invalid|as never|as unknown as|deterministic-text-v1|Lecture 3|講義 3/);
});

test("the seven registered subjects are excluded before legacy selection and issued independently", () => {
  assert.ok(registry.indexOf("westernArtObjectiveScopeSubjectIds") < registry.indexOf("const dueTracked ="));
  assert.ok(registry.indexOf("legacyEligibleIds.delete(id)") < registry.indexOf("const dueTracked ="));
  assert.match(registry, /\.\.\.westernArtCards, \.\.\.legacyCards/);
  assert.match(registry, /\.slice\(0, project\.review\.sessionSize\)/);
  assert.match(runtime, /for \(const entry of westernArtObjectiveRegistry\)/);
  assert.match(runtime, /objective_not_due/);
  assert.match(runtime, /decoded\.entry\.exerciseId !== entry\.exerciseId/);
  assert.match(trusted, /westernArtObjectiveRegistry\.find\(\(entry\) => entry\.exerciseId === exerciseId\)/);
});

test("receipt recovery precedes persisted project dispatch; offline and migrations are unchanged", () => {
  assert.ok(dispatcher.indexOf("recoverAcceptedPilotAttempt(request)") < dispatcher.indexOf("resolveObjectiveInstanceArchive("));
  assert.match(dispatcher, /getWesternArtObjectiveByExerciseId\(persisted\.exercise_id\)/);
  assert.doesNotMatch(dispatcher, /request\.projectId|body\.projectId/);
  assert.doesNotMatch(runtime, /study_graph_record_review|p_srs_plan/);
  assert.equal(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).length, 22);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
});
