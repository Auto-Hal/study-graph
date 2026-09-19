import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("opportunity contracts stay future-only and do not alter current issuer/runtime", () => {
  const opportunity = read("src/lib/review/objective-opportunity.ts");
  const runtime = read("src/lib/review/pilot-runtime.ts");
  assert.doesNotMatch(opportunity, /server-only|node:crypto|supabase|notion|indexedDB|serviceWorker/i);
  assert.doesNotMatch(runtime, /objective-opportunity|deterministicObjectiveGradeV1/);
  assert.match(opportunity, /OBJECTIVE_SRS_OPPORTUNITY_TTL_SECONDS = 604800/);
});

test("request identity remains the original six-field tuple", () => {
  const attempt = read("src/lib/review/exercises/attempt-content.ts");
  for (const field of ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint"]) {
    assert.match(attempt, new RegExp(`${field}: request\\.${field}`));
  }
  assert.doesNotMatch(attempt, /expectedStateRevision|opportunityKind|gradePolicyVersion/);
});

test("offline receipt wrapper remains descriptor v1 and storage versions stay unchanged", () => {
  const offline = read("src/lib/review/offline/model-core.ts");
  const outbox = read("src/lib/review/offline/attempt-outbox.ts");
  assert.match(offline, /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1 as const/);
  assert.match(outbox, /ATTEMPT_OUTBOX_DB_VERSION = 1 as const/);
  assert.match(read("src/lib/review/offline/instance-cache.ts"), /OFFLINE_INSTANCE_CACHE_DB_VERSION = 1 as const/);
  assert.match(read("src/lib/review/offline/objective-state-mirror.ts"), /OBJECTIVE_STATE_MIRROR_DB_VERSION = 1 as const/);
});

test("Phase 5A-1a itself introduced no migration or v1 writer change", () => {
  const migrations = readdirSync(resolve(root, "supabase/migrations"));
  assert.equal(migrations.some((name) => /phase5a.?1a/i.test(name)), false);
  for (const path of [
    "supabase/migrations/20260908100000_phase_4d_2_objective_persistence.sql",
    "supabase/migrations/20260908120000_phase_4d_4_objective_cutover.sql",
  ]) {
    assert.doesNotMatch(read(path), /stale-opportunity|issuance-context-missing/);
  }
});
