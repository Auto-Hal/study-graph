import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const registry = read("src/lib/review/registry.ts");
const philosophy = read("src/lib/review/philosophy-pilot-runtime.ts");
const attemptRoute = read("app/api/review/pilot/attempt/route.ts");
const receiptRoute = read("app/api/review/pilot/receipt/route.ts");
const session = read("src/components/ReviewSession.tsx");

test("Philosophy activation is a separate exact-true server flag; legacy target is excluded before selection", () => {
  assert.match(philosophy, /STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED/);
  assert.match(philosophy, /newObjectiveIssuanceVersion\(\) !== "v2"/);
  assert.ok(registry.indexOf("legacyEligibleIds.delete(id)") < registry.indexOf("const dueTracked ="));
  assert.match(philosophy, /objective_not_due/);
  assert.match(registry, /\.slice\(0, project\.review\.sessionSize\)/);
  assert.match(read(".env.example"), /^STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED=$/m);
  assert.doesNotMatch(read(".env.example"), /STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED=true/);
});

test("server-owned dispatch and receipt lookup use persisted generic archive; browser sends six fields", () => {
  assert.match(attemptRoute, /submitVersionedPilotAttempt\(parsed\.request\)/);
  assert.match(read("src/lib/review/pilot-attempt-dispatch.ts"), /recoverAcceptedPilotAttempt\(request\)/);
  assert.match(read("src/lib/review/pilot-attempt-dispatch.ts"), /persisted\.project_id === "philosophy"/);
  assert.match(receiptRoute, /const learnerId = getObjectiveRuntimeConfig\(\)\.learnerId/);
  assert.match(receiptRoute, /resolveObjectiveInstanceArchive\(instanceId, learnerId\)/);
  assert.match(receiptRoute, /getKuzushijiPilotAttemptReceipt\(instanceId\)/);
  assert.match(read("src/lib/review/pilot-attempt-contract.ts"), /Object\.keys\(body\)\.length !== fields\.length/);
  assert.doesNotMatch(`${attemptRoute}\n${read("src/lib/review/pilot-attempt-dispatch.ts")}`, /body\.projectId|request\.projectId/);
});

test("ReviewSession uses existing durable Objective outbox and only Kuzushiji refreshes its mirror", () => {
  assert.match(session, /commitPilotOfflineAttempt\(submission\)/);
  assert.match(session, /sendPilotOutboxAttempt\(committed\.record\.attemptId, \{ receiptKind: "objective" \}\)/);
  assert.match(session, /if \(session\.projectId === "kuzushiji"\) \{[\s\S]*?syncObjectiveStateMirror\(\)/);
  assert.match(session, /session\.projectId !== "kuzushiji" && session\.projectId !== "philosophy"/);
  assert.doesNotMatch(session, /STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED/);
});

test("this slice adds no database migration or offline protocol version", () => {
  assert.equal(readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).length, 21);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
  assert.doesNotMatch(philosophy, /recordKuzushijiPilotAttempt|recordKuzushijiObjectivePilotAttempt|p_srs_plan/);
});
