import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260907120000_phase_4c_4_pilot_runtime.sql"), "utf8");
const registry = readFileSync(resolve(root, "src/lib/review/registry.ts"), "utf8");
const session = readFileSync(resolve(root, "src/components/ReviewSession.tsx"), "utf8");
const attemptRoute = readFileSync(resolve(root, "app/api/review/pilot/attempt/route.ts"), "utf8");
const issueRoute = readFileSync(resolve(root, "app/api/review/pilot/issue/route.ts"), "utf8");
const supabaseClient = readFileSync(resolve(root, "src/lib/supabase/pilot.ts"), "utf8");
const normalized = migration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

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
  assert.match(attemptRoute, /sameOrigin/);
  assert.doesNotMatch(attemptRoute, /isCorrect/);
  assert.doesNotMatch(attemptRoute, /srsApplied/);
  assert.doesNotMatch(attemptRoute, /learnerId/);
  assert.match(issueRoute, /issueKuzushijiPilotReview/);
  assert.match(registry, /isKuzushijiPilotDefinition/);
  assert.match(registry, /failed issue never falls back/);
  assert.match(session, /\/api\/review\/pilot\/attempt/);
  assert.match(session, /crypto\.randomUUID\(\)/);
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
