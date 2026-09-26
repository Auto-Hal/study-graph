import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("prefetch API accepts only durable device/request IDs and keeps same-origin protection", () => {
  const route = read("app/api/review/pilot/prefetch/route.ts");
  assert.match(route, /pilotWriteSameOriginFailure/);
  assert.match(route, /status: 403/);
  assert.doesNotMatch(route, /pilot_authorization_required/);
  assert.match(route, /deviceId/);
  assert.match(route, /issuanceRequestId/);
  assert.doesNotMatch(route, /learnerId|objectiveId|srsEpoch|revisionId|snapshotId/);
  assert.match(route, /prefetchKuzushijiOfflineInstance/);
  assert.match(route, /export async function POST/);
});

test("client prefetch persists identities before transport and never creates a provisional instance", () => {
  const client = read("src/lib/review/offline/prefetch-client.ts");
  assert.match(client, /prepareOfflinePrefetchRequest/);
  assert.ok(client.indexOf("prepareOfflinePrefetchRequest") < client.indexOf("fetchImpl(\"\/api\/review\/pilot\/prefetch\""));
  assert.match(client, /persistPrefetchedOfflineInstance/);
  assert.match(client, /cacheVerifiedOfflineAsset/);
  assert.doesNotMatch(client, /instanceId\s*[:=].*randomUUID/);
  const cache = read("src/lib/review/offline/instance-cache.ts");
  assert.match(cache, /study-graph-offline-instance-cache/);
  assert.match(cache, /device_meta/);
  assert.match(cache, /issuance_requests/);
  assert.match(cache, /issued_instances/);
});

test("asset caching verifies bytes before IndexedDB readiness and keys by checksum", () => {
  const assets = read("src/lib/review/offline/assets.ts");
  assert.match(assets, /subtle\.digest\("SHA-256"/);
  assert.match(assets, /offline_sha256=/);
  const verification = assets.slice(assets.indexOf("export async function cacheVerifiedOfflineAsset"));
  assert.ok(verification.indexOf("cache.put") < verification.indexOf("markOfflineAssetReady"));
  assert.match(assets, /if \(!asset\.checksum\)/);
  assert.match(assets, /readVerifiedOfflineAssetBytes/);
});

test("offline review consumes only ready server-issued instances and durable outbox callback", () => {
  const page = read("app/review/kuzushiji-offline/page.tsx");
  const component = read("src/components/OfflineKuzushijiReview.tsx");
  assert.match(page, /OfflineKuzushijiReview/);
  assert.match(component, /listReadyOfflineIssuedInstances/);
  assert.match(component, /isOfflineAssetRenderable/);
  assert.match(component, /readVerifiedOfflineAssetBytes/);
  assert.match(component, /markOfflineInstanceAnswered/);
  assert.doesNotMatch(component, /api\/review\/pilot\/prefetch/);
  const session = read("src/components/ReviewSession.tsx");
  assert.match(session, /onPilotAttemptDurablyCommitted/);
  assert.match(session, /commitPilotOfflineAttempt/);
  assert.ok(session.indexOf("commitPilotOfflineAttempt") < session.indexOf("onPilotAttemptDurablyCommitted"));
  assert.match(session, /try \{[\s\S]*await onPilotAttemptDurablyCommitted\([\s\S]*catch \(error\)/);
  const callback = session.indexOf("await onPilotAttemptDurablyCommitted");
  const callbackCatch = session.indexOf("catch (error)", callback);
  const transport = session.indexOf("sendPilotOutboxAttempt", callback);
  assert.ok(callbackCatch > callback && callbackCatch < transport, "marker failure must not block transport");
});

test("prefetch keeps the operational kill switch server-owned and uses the exact Scope anchor", () => {
  const issuer = read("src/lib/review/offline/pilot-prefetch.ts");
  const supabase = read("src/lib/supabase/pilot.ts");
  const pilot = read("src/lib/review/exercises/kuzushiji-pilot.ts");
  const route = read("app/api/review/pilot/prefetch/route.ts");
  assert.match(pilot, /KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID\s*=\s*"3ccd2793-4134-815f-95f0-cc64dcdb86c7"/);
  assert.match(issuer, /isPilotIssuanceEnabled/);
  assert.match(issuer, /!isPilotIssuanceEnabled\(\) \|\| newObjectiveIssuanceVersion\(\) !== "v2"/);
  assert.match(issuer, /newIssuanceAllowed:\s*true/);
  assert.match(supabase, /p_new_issuance_allowed:\s*input\.newIssuanceAllowed/);
  assert.doesNotMatch(route, /learnerId|objectiveId|srsEpoch|revisionId|snapshotId|issuanceAllowed|newIssuanceAllowed/);
  const scope = read("src/lib/review/offline/pilot-scope.ts");
  assert.match(scope, /character\.id === KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID/);
  assert.doesNotMatch(scope, /acceptedKuzushijiValues|includes\("あ"\)/);
});

test("offline review respects a newer explicit Scope exclusion without deleting attempts", () => {
  const component = read("src/components/OfflineKuzushijiReview.tsx");
  const helper = read("src/lib/review/offline/offline-card.ts");
  assert.match(component, /getCachedCurrentScopeKnowledgeSnapshot/);
  assert.match(component, /isOfflinePilotInstanceOfferable/);
  assert.ok(component.indexOf("findOfflineAttemptByInstanceId") < component.indexOf("isOfflinePilotInstanceOfferable"));
  assert.match(helper, /currentSnapshot\.generation <= instanceGeneration/);
  assert.match(helper, /status !== "ineligible"/);
  assert.doesNotMatch(component, /deleteDatabase|delete\(/);
});

test("v1 content remains and v2 is an additive checksum-pinned boundary", () => {
  const pilot = read("src/lib/review/exercises/kuzushiji-pilot.ts");
  const revision = read("src/lib/review/exercises/kuzushiji-revision.ts");
  assert.match(pilot, /checksum: null/);
  assert.match(pilot, /KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM/);
  assert.match(pilot, /assetVersion: 2/);
  assert.match(revision, /kuzushijiPilotRevisionV2/);
  assert.match(revision, /kuzushijiPilotContentReleaseManifestV2/);
  assert.match(revision, /Pin the repository asset checksum/);
});

test("phase 4E-5 has no runtime Notion fallback or automatic bulk scheduling", () => {
  const control = read("src/components/OfflinePrefetchControl.tsx");
  assert.match(control, /オフライン復習を準備/);
  assert.match(control, /\/review\/kuzushiji-offline/);
  assert.doesNotMatch(control, /useEffect|setInterval|cron/i);
  const migration = read("supabase/migrations/20260908150000_phase_4e_5_offline_prefetch.sql");
  assert.doesNotMatch(migration, /review_state|review_attempts/);
});
