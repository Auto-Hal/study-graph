import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operations = readFileSync(resolve(root, "src/lib/review/pilot-operations.ts"), "utf8");
const attemptRoute = readFileSync(resolve(root, "app/api/review/pilot/attempt/route.ts"), "utf8");
const issueRoute = readFileSync(resolve(root, "app/api/review/pilot/issue/route.ts"), "utf8");
const runtime = readFileSync(resolve(root, "src/lib/review/pilot-runtime.ts"), "utf8");
const progress = readFileSync(resolve(root, "app/projects/kuzushiji/progress/page.tsx"), "utf8");
const docs = readFileSync(resolve(root, "docs/PHASE_4D_5_OBJECTIVE_OPERATIONS.md"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");

test("Objective issuance keeps the existing fail-closed operational switch", () => {
  assert.match(operations, /STUDY_GRAPH_PILOT_ISSUANCE_ENABLED/);
  assert.match(issueRoute, /!isPilotIssuanceEnabled\(\)/);
  assert.match(issueRoute, /pilot_issuance_disabled/);
  assert.match(envExample, /STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=/);
});

test("containment never disables accepted-attempt retry handling", () => {
  assert.doesNotMatch(attemptRoute, /isPilotIssuanceEnabled/);
  assert.match(attemptRoute, /submitKuzushijiPilotAttempt/);
  assert.match(runtime, /resultFromStoredObjectiveReceipt/);
  assert.match(runtime, /resultFromStoredReceipt/);
});

test("runtime preserves immutable target isolation between Objective and legacy writers", () => {
  assert.match(runtime, /instance\.srs_target === \"objective\"/);
  assert.match(runtime, /recordKuzushijiObjectivePilotAttempt/);
  assert.match(runtime, /recordKuzushijiPilotAttempt/);
  assert.doesNotMatch(runtime, /recordKuzushijiObjectivePilotAttempt[\s\S]{0,500}recordKuzushijiPilotAttempt[\s\S]{0,500}await Promise\.all/);
});

test("Progress presents Objective state as current authority and legacy history as archival", () => {
  assert.match(progress, /getKuzushijiPilotObjectiveState/);
  assert.match(progress, /現在の復習/);
  assert.match(progress, /これまでの復習/);
  assert.match(progress, /これまでの自己評価/);
  assert.doesNotMatch(progress, /Objective SRS 接続中/);
  assert.doesNotMatch(progress, /LEGACY ATTEMPTS/);
  assert.doesNotMatch(progress, /getReviewStates/);
  assert.doesNotMatch(progress, /Legacy復習履歴[\s\S]{0,3000}次回の復習予定/);
});

test("rollback documentation forbids destructive state repair or automatic reseeding", () => {
  assert.match(docs, /STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false/);
  assert.match(docs, /Do not shrink the `srs_target` constraint/);
  assert.match(docs, /must not later be copied automatically into Objective epoch 1/);
  assert.match(docs, /Do not create a fake production answer/);
  assert.doesNotMatch(docs, /delete Objective state|truncate|drop table/i);
});
