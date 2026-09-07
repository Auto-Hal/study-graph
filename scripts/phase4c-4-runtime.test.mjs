import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260907120000_phase_4c_4_pilot_runtime.sql"), "utf8");
const reconciliation = readFileSync(resolve(root, "supabase/migrations/20260907130000_phase_4c_4_receipt_reconciliation.sql"), "utf8");
const registry = readFileSync(resolve(root, "src/lib/review/registry.ts"), "utf8");
const session = readFileSync(resolve(root, "src/components/ReviewSession.tsx"), "utf8");
const attemptRoute = readFileSync(resolve(root, "app/api/review/pilot/attempt/route.ts"), "utf8");
const issueRoute = readFileSync(resolve(root, "app/api/review/pilot/issue/route.ts"), "utf8");
const supabaseClient = readFileSync(resolve(root, "src/lib/supabase/pilot.ts"), "utf8");
const auth = readFileSync(resolve(root, "src/lib/review/pilot-auth.ts"), "utf8");
const authCore = readFileSync(resolve(root, "src/lib/review/pilot-auth-core.ts"), "utf8");
const middleware = readFileSync(resolve(root, "middleware.ts"), "utf8");
const runtime = readFileSync(resolve(root, "src/lib/review/pilot-runtime.ts"), "utf8");
const receipt = readFileSync(resolve(root, "src/lib/review/exercises/receipt.ts"), "utf8");
const normalized = migration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const normalizedReconciliation = reconciliation.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("Phase 4C-4 adds only server-side pilot boundaries", () => {
  assert.match(normalized, /study_graph_register_kuzushiji_pilot_archive/);
  assert.match(normalized, /study_graph_issue_kuzushiji_pilot_instance/);
  assert.match(normalized, /study_graph_resolve_kuzushiji_pilot_instance/);
  assert.match(normalized, /study_graph_get_kuzushiji_pilot_attempt_receipt/);
  assert.match(normalized, /security definer/);
  assert.match(normalized, /set search_path = pg_catalog/);
  assert.match(normalized, /revoke all on function public\.study_graph_register_kuzushiji_pilot_archive/);
  assert.match(normalized, /grant execute on function public\.study_graph_register_kuzushiji_pilot_archive[\s\S]*to service_role/);
  assert.doesNotMatch(normalized, /grant execute on function public\.[\s\S]*to anon/);
  assert.doesNotMatch(normalized, /grant execute on function public\.[\s\S]*to authenticated/);
  assert.doesNotMatch(normalized, /alter table public\./);
  assert.doesNotMatch(normalized, /drop table/);
});

test("archive registration and instance issuance are idempotent/conflict aware", () => {
  assert.match(normalized, /archive_conflict/);
  assert.match(normalized, /on conflict \(release_id, revision_id\) do nothing/);
  assert.match(normalized, /revision_not_issuable/);
  assert.match(normalized, /pilot_archive_not_registered/);
  assert.match(normalized, /extensions\.gen_random_uuid\(\)/);
});

test("pilot attempt route accepts only server-relevant submission fields", () => {
  assert.match(attemptRoute, /validatePilotAttemptInput/);
  assert.match(attemptRoute, /submitKuzushijiPilotAttempt/);
  assert.match(attemptRoute, /pilotWriteAuthorizationFailure/);
  assert.match(issueRoute, /pilotWriteAuthorizationFailure/);
  assert.doesNotMatch(attemptRoute, /isCorrect/);
  assert.doesNotMatch(attemptRoute, /srsApplied/);
  assert.doesNotMatch(attemptRoute, /learnerId/);
  assert.match(issueRoute, /issueKuzushijiPilotReview/);
  assert.match(registry, /isKuzushijiPilotDefinition/);
  assert.match(registry, /failed issue never falls back/);
  assert.match(session, /\/api\/review\/pilot\/attempt/);
  assert.match(session, /crypto\.randomUUID\(\)/);
});

test("pilot write APIs have a server-issued authorization boundary", () => {
  assert.match(auth, /server-only/);
  assert.match(auth, /STUDY_GRAPH_APP_TOKEN/);
  assert.match(auth, /StudyGraph_APP_TOKEN/);
  assert.match(auth, /verifyPilotSessionToken/);
  assert.match(authCore, /HMAC/);
  assert.match(middleware, /httpOnly: true/);
  assert.match(middleware, /sameSite: "lax"/);
  assert.match(middleware, /PILOT_SESSION_COOKIE/);
  assert.doesNotMatch(auth, /NEXT_PUBLIC_/);
  assert.doesNotMatch(middleware, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(issueRoute, /authorizationFailure === "cross_origin_request" \? 403 : 401/);
  assert.match(attemptRoute, /authorizationFailure === "cross_origin_request" \? 403 : 401/);
  assert.doesNotMatch(issueRoute, /learnerId/);
  assert.doesNotMatch(attemptRoute, /learnerId/);
});

test("receipt reconciliation restores canonical 4C-3 authority fields without destructive DDL", () => {
  assert.match(normalizedReconciliation, /create or replace function public\.study_graph_record_exercise_attempt\(/);
  for (const field of ["receiptVersion", "attemptId", "instanceId", "acceptedAt", "gradingStatus", "isCorrect", "effectiveSrsGrade", "srsApplied", "srsReason", "legacyReviewAttemptId", "reviewStateBefore", "reviewStateAfter"]) {
    assert.match(reconciliation, new RegExp(`'${field}'`));
  }
  assert.match(normalizedReconciliation, /security definer/);
  assert.match(normalizedReconciliation, /set search_path = pg_catalog/);
  assert.match(normalizedReconciliation, /revoke all on function public\.study_graph_record_exercise_attempt[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalizedReconciliation, /grant execute on function public\.study_graph_record_exercise_attempt[\s\S]*to service_role/);
  assert.doesNotMatch(normalizedReconciliation, /grant execute on function public\.[\s\S]*to anon/);
  assert.doesNotMatch(normalizedReconciliation, /grant execute on function public\.[\s\S]*to authenticated/);
  assert.doesNotMatch(normalizedReconciliation, /alter table public\./);
  assert.doesNotMatch(normalizedReconciliation, /update private\.exercise_attempts/);
  assert.doesNotMatch(normalizedReconciliation, /drop table/);
  assert.match(normalizedReconciliation, /pg_advisory_xact_lock/);
  assert.match(normalizedReconciliation, /for update/);
  assert.match(normalizedReconciliation, /when 'again' then[\s\S]*interval '10 minutes'/);
  assert.match(normalizedReconciliation, /ceil\(v_previous_interval \* 1\.2\)/);
  assert.match(normalizedReconciliation, /round\(v_previous_interval \* 2\.2\)/);
  assert.match(normalizedReconciliation, /round\(v_previous_interval \* 3\.2\)/);
});

test("receipt restoration is receipt-first and fails closed when legacy fields are absent", () => {
  assert.match(runtime, /resultFromStoredReceipt/);
  assert.match(runtime, /stored_receipt_incomplete/);
  assert.doesNotMatch(runtime, /receiptField/);
  assert.match(receipt, /reviewStateBefore/);
  assert.match(receipt, /isCorrect/);
  assert.match(receipt, /effectiveSrsGrade/);
  assert.match(receipt, /StoredReceiptIncompleteError/);
  assert.match(runtime, /const existing = await getKuzushijiPilotAttemptReceipt/);
  assert.match(runtime, /return receiptResult\(existing\.receipt, request\.instanceId\)/);
  assert.doesNotMatch(runtime, /receiptField/);
  assert.doesNotMatch(runtime, /gradingStatus: receipt/);
  assert.doesNotMatch(runtime, /srsApplied: receipt/);
});

test("service role and fixed learner identity remain server-only", () => {
  assert.match(supabaseClient, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(supabaseClient, /STUDY_GRAPH_LEARNER_ID/);
  assert.doesNotMatch(supabaseClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(session, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(session, /STUDY_GRAPH_LEARNER_ID/);
});

test("pilot path does not invoke the legacy writer", () => {
  const pilotBlock = session.split('if (isPilot) {')[1]?.split('if (persistence === "fallback")')[0] ?? "";
  assert.match(pilotBlock, /\/api\/review\/pilot\/attempt/);
  assert.doesNotMatch(pilotBlock, /\/api\/review\/attempt/);
  assert.match(session, /\/api\/review\/attempt/);
});
