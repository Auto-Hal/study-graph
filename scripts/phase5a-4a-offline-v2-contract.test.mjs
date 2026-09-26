import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { kuzushijiPilotRevision, kuzushijiPilotRevisionV2, kuzushijiPilotContentReleaseV2 } from "../src/lib/review/exercises/kuzushiji-revision.ts";
import { KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM } from "../src/lib/review/exercises/kuzushiji-pilot.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260925120000_phase_5a_4a_atomic_offline_objective_v2.sql");
const online = read("src/lib/review/pilot-runtime.ts");
const offline = read("src/lib/review/offline/pilot-prefetch.ts");
const adapter = read("src/lib/supabase/pilot.ts");
const route = read("app/api/review/pilot/prefetch/route.ts");

test("migration 22 is additive and retains immutable v1/v2 content", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(files.length, 22);
  assert.equal(files.at(-1), "20260925120000_phase_5a_4a_atomic_offline_objective_v2.sql");
  assert.equal(kuzushijiPilotRevision.visualAssets[0].checksum, null);
  assert.equal(kuzushijiPilotRevisionV2.contentHash, "fca3edc54f17aa731c53cedd1130ff83d51a318ee07696c3310129f67a8db86d");
  assert.equal(kuzushijiPilotContentReleaseV2.manifestHash, "a6346dcb6b1b7a6df890f032ec3974e0c95ac3e631367ab022707d09c6357446");
  assert.equal(KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM, "3cc8847155bddd0611da36ad4d972c3c7af7512bd62cfce72e460027ef84ad06");
});

test("atomic wrapper recovers before flags and candidate, then locks objective before request", () => {
  const wrapper = migration.slice(migration.indexOf("create function public.study_graph_prefetch_kuzushiji_objective_instance_v2"));
  const firstRecovery = wrapper.indexOf("select r.* into v_request");
  const candidate = wrapper.indexOf("select er.* into v_revision");
  const objectiveLock = wrapper.indexOf("'objective|' || p_learner_id");
  const requestLock = wrapper.indexOf("'offline-prefetch-request|'");
  const snapshot = wrapper.indexOf("from private.project_snapshot_sync_state st");
  const issue = wrapper.indexOf("public.study_graph_issue_objective_instance_v2(");
  const media = wrapper.indexOf("offline_asset_integrity_unavailable");
  const mapping = wrapper.indexOf("insert into private.offline_instance_issuance_requests");
  assert.ok(firstRecovery >= 0 && firstRecovery < candidate && candidate < objectiveLock);
  assert.ok(objectiveLock < requestLock && requestLock < snapshot && snapshot < issue && issue < media && media < mapping);
  assert.match(wrapper, /p_srs_epoch, 'scheduled'/);
  assert.match(wrapper, /for update of st/);
  assert.doesNotMatch(wrapper, /oldest still-unaccepted prefetch|order by r\.created_at asc\s+limit 1\s+for update of r/i);
});

test("old RPC is recovery-only and new wrapper has service-role-only ACL", () => {
  const old = migration.slice(migration.indexOf("create or replace function public.study_graph_prefetch_kuzushiji_objective_instance("), migration.indexOf("create function public.study_graph_prefetch_kuzushiji_objective_instance_v2"));
  assert.match(old, /offline_prefetch_v1_issuance_closed/);
  assert.doesNotMatch(old, /insert into private\.exercise_instances|insert into private\.offline_instance_issuance_requests/);
  assert.match(migration, /security definer set search_path = pg_catalog/);
  assert.match(migration, /revoke execute on function public\.study_graph_prefetch_kuzushiji_objective_instance_v2\([\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.study_graph_prefetch_kuzushiji_objective_instance_v2\([\s\S]*?to service_role/);
});

test("future online and offline candidates are v2 but persisted reuse remains authority", () => {
  assert.match(online, /ensureKuzushijiPilotOfflineArchive\(\)/);
  assert.match(online, /createPilotPresentation\(kuzushijiPilotRevisionV2Payload\)/);
  assert.match(online, /resolveKuzushijiPilotInstance\(issued\.instanceId\)/);
  assert.doesNotMatch(online, /issueKuzushijiPilotInstance\(/);
  assert.match(offline, /ensureKuzushijiPilotOfflineArchive\(\)/);
  assert.match(offline, /createPilotPresentation\(kuzushijiPilotRevisionV2Payload\)/);
  assert.match(offline, /selectedRevision\(row\)/);
  assert.match(offline, /row\.revision_content_hash/);
  assert.match(offline, /row\.presentation_hash !== hashPilotPresentation\(presentation\)/);
  assert.match(offline, /assertValidOfflineAssetDescriptor/);
});

test("recovery precedes rollout gates and browser/outbox contracts are unchanged", () => {
  assert.ok(offline.indexOf("createIfMissing: false") < offline.indexOf("isPilotIssuanceEnabled()"));
  assert.match(offline, /newObjectiveIssuanceVersion\(\) !== "v2"/);
  assert.match(adapter, /offline_asset_integrity_unavailable[\s\S]*?409/);
  assert.match(route, /key !== "deviceId" && key !== "issuanceRequestId"/);
  assert.doesNotMatch(route, /projectId|objectiveId|srsEpoch/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_INSTANCE_DESCRIPTOR_VERSION = 1/);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.doesNotMatch(migration, /alter table|create table|update private\.exercise_revisions/i);
});
