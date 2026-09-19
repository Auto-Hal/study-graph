import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("recovery reader is browser-safe and has no authority-side effects", () => {
  const source = read("src/lib/review/objective-recovery.ts");
  assert.doesNotMatch(source, /server-only|node:crypto|supabase|notion|indexedDB|service.?worker|fetch\s*\(/i);
  assert.match(source, /restoreObjectiveReceiptForRecovery/);
  assert.match(source, /readObjectiveSchedulingContext/);
  assert.match(source, /terminal:\s*true/);
});

test("Receipt v1/v2 recovery remains strict and version-specific", () => {
  const receipt = read("src/lib/review/exercises/receipt.ts");
  assert.match(receipt, /receipt\.receiptVersion !== 1 && receipt\.receiptVersion !== 2/);
  assert.match(receipt, /receipt\.receiptVersion === 1/);
  assert.match(receipt, /objectiveReasonsV2/);
  assert.match(receipt, /stale-opportunity/);
  assert.match(receipt, /issuance-context-missing/);
  assert.match(read("src/lib/review/objective-recovery.ts"), /resultFromStoredObjectiveReceipt/);
});

test("historical rows are not backfilled and no accepted no-SRS repair path exists", () => {
  const migrations = readdirSync(resolve(root, "supabase/migrations"));
  assert.equal(migrations.some((name) => /phase5a.?1c/i.test(name)), false);
  const recovery = read("src/lib/review/objective-recovery.ts");
  assert.match(recovery, /historical-v1/);
  assert.match(recovery, /srsAuthority: "none"/);
  assert.match(recovery, /accepted-no-srs/);
  assert.doesNotMatch(recovery, /insert into|update private|study_graph_record_objective_attempt/);
});

test("offline retry identity and storage versions remain unchanged", () => {
  const attemptContent = read("src/lib/review/exercises/attempt-content.ts");
  for (const field of ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint"]) {
    assert.match(attemptContent, new RegExp(`${field}: request\\.${field}`));
  }
  assert.doesNotMatch(attemptContent, /opportunityId|expectedStateRevision|opportunityKind|gradePolicyVersion/);
  const model = read("src/lib/review/offline/model-core.ts");
  assert.match(model, /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1 as const/);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1 as const/);
  assert.match(read("src/lib/review/offline/outbox-core.ts"), /authoritativeReceiptResult/);
});

test("current runtime and API routes remain on their historical v1 paths", () => {
  for (const path of [
    "src/lib/review/pilot-runtime.ts",
    "src/lib/supabase/pilot.ts",
    "app/api/review/pilot/issue/route.ts",
    "app/api/review/pilot/attempt/route.ts",
  ]) {
    assert.doesNotMatch(read(path), /study_graph_issue_objective_instance_v2|study_graph_record_objective_attempt_v2/);
  }
  assert.doesNotMatch(read("src/lib/review/objective-recovery.ts"), /ObjectiveSrsReceiptV2\s*=/);
});

test("docs and CI record the compatibility boundary", () => {
  const docs = read("docs/PHASE_5A_1C_OBJECTIVE_RECOVERY.md");
  assert.match(docs, /Receipt v1/);
  assert.match(docs, /Receipt v2/);
  assert.match(docs, /stale-opportunity/);
  assert.match(docs, /issuance-context-missing/);
  assert.match(docs, /six-field request hash/);
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(typeof packageJson.scripts?.["test:phase5a-1c"], "string");
  assert.match(read(".github/workflows/ci.yml"), /test:phase5a-1c/);
});


