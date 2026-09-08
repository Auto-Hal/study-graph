import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");

const worker = read("public/study-graph-sw.js");
const serviceWorker = read("src/lib/review/offline/service-worker.ts");
const foregroundSync = read("src/lib/review/offline/foreground-sync.ts");
const resultReconciliation = read("src/lib/review/offline/result-reconciliation.ts");
const shellRegistration = read("src/components/OfflineShellRegistration.tsx");
const layout = read("app/layout.tsx");
const manifest = read("app/manifest.ts");
const shellPage = read("app/offline-review/page.tsx");
const offlineReview = read("src/components/OfflineKuzushijiReview.tsx");
const mirror = read("src/lib/review/offline/objective-state-mirror.ts");
const mirrorComponent = read("src/components/ObjectiveStateMirrorSync.tsx");
const objectiveRoute = read("app/api/review/pilot/objective-state/route.ts");
const reviewSession = read("src/components/ReviewSession.tsx");
const packageJson = JSON.parse(read("package.json"));

test("service worker keeps APIs, login, and writes network-only", () => {
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname === "\/login"/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.doesNotMatch(worker, /fetch\([^)]*\/api\/|fetch\([^)]*attempt/);
  assert.doesNotMatch(worker, /OFFLINE_ASSET_CACHE[\s\S]*caches\.delete/);
});

test("warmed shell metadata can be served from the owned cache", () => {
  assert.match(worker, /url\.pathname === "\/manifest\.webmanifest"/);
  assert.match(worker, /url\.pathname === "\/icon\.svg"/);
  assert.match(serviceWorker, /\/manifest\.webmanifest/);
  assert.match(serviceWorker, /\/icon\.svg/);
});

test("navigation is network-first and offline falls back to the dedicated shell", () => {
  assert.match(worker, /request\.mode === "navigate"/);
  const navigation = worker.slice(worker.indexOf('if (request.mode === "navigate")'));
  assert.ok(navigation.indexOf("fetch(request)") < navigation.indexOf("cache.match(OFFLINE_SHELL_PATH)"));
  assert.match(serviceWorker, /OFFLINE_SHELL_PATH = "\/offline-review"/);
  assert.match(serviceWorker, /warmOfflineReviewShell/);
});

test("activation removes only owned app-shell caches", () => {
  assert.match(worker, /name\.startsWith\(SHELL_CACHE_PREFIX\)/);
  assert.match(worker, /name !== SHELL_CACHE/);
  assert.match(worker, /study-graph-offline-assets-v1/);
  assert.match(serviceWorker, /study-graph-app-shell-/);
  assert.doesNotMatch(serviceWorker, /deleteDatabase/);
});

test("registration and emergency disable are client-only and preserve durable stores", () => {
  assert.match(shellRegistration, /registerOfflineServiceWorker/);
  assert.match(layout, /OfflineShellRegistration/);
  assert.match(serviceWorker, /NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED/);
  assert.match(serviceWorker, /registration\.unregister/);
  assert.doesNotMatch(serviceWorker, /study-graph-attempt-outbox|study-graph-offline-instance-cache|study-graph-offline-assets-v1/);
});

test("shell readiness requires an activated worker with a bounded wait", () => {
  assert.match(serviceWorker, /waitForOfflineServiceWorkerActivation/);
  assert.match(serviceWorker, /state === ["']activated["']/);
  assert.match(serviceWorker, /OFFLINE_SHELL_ACTIVATION_TIMEOUT_MS/);
  assert.match(serviceWorker, /setTimeout/);
  assert.match(serviceWorker, /warmOfflineReviewShell[\s\S]*waitForOfflineServiceWorkerActivation/);
});

test("manifest and dedicated cold-start route are present", () => {
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp/);
  assert.match(shellPage, /OfflineKuzushijiReview/);
  assert.match(offlineReview, /getCachedCurrentScopeKnowledgeSnapshot/);
  assert.match(offlineReview, /readVerifiedOfflineAssetBytes/);
  assert.doesNotMatch(shellPage, /getKuzushijiDashboard/);
});

test("objective state feed is authenticated read-only and server-fixed", () => {
  assert.match(objectiveRoute, /isPilotSessionRequestAuthenticated/);
  assert.match(objectiveRoute, /getKuzushijiPilotObjectiveState/);
  assert.match(objectiveRoute, /KUZUSHIJI_PILOT_OBJECTIVE_ID/);
  assert.match(objectiveRoute, /KUZUSHIJI_PILOT_SRS_EPOCH/);
  assert.match(objectiveRoute, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(objectiveRoute, /method:\s*["']POST|Notion|recordKuzushiji|updateObjective|insert/);
  assert.doesNotMatch(objectiveRoute, /searchParams|learnerId.*request|p_learner_id.*request/);
  assert.match(mirrorComponent, /syncObjectiveStateMirror/);
  assert.match(mirror, /study-graph-objective-state-mirror/);
  assert.match(mirror, /adoptObjectiveStateMirror/);
  assert.doesNotMatch(mirror, /ReviewSession|sendPilotOutboxAttempt|recordKuzushiji/);
});

test("foreground recovery is shared by cold-start and ReviewSession", () => {
  assert.match(foregroundSync, /recoverSendingOfflineAttempts/);
  assert.match(foregroundSync, /flushPilotAttemptOutbox/);
  assert.match(offlineReview, /PilotOutboxForegroundSync/);
  assert.match(reviewSession, /recoverAndFlushPilotOutbox/);
  assert.match(reviewSession, /reconcilePilotResults/);
  assert.match(resultReconciliation, /authoritativeReceiptResult/);
  assert.match(resultReconciliation, /stored_receipt_incomplete/);
  assert.ok(reviewSession.indexOf("await recoverAndFlushPilotOutbox()") < reviewSession.indexOf("await refreshOutboxCounts"));
  assert.ok(reviewSession.indexOf("await refreshOutboxCounts") < reviewSession.indexOf("await syncObjectiveStateMirror()"));
});

test("cold-start shell has no server data dependency and keeps prepared instances immutable", () => {
  assert.match(shellPage, /dynamic = "force-dynamic"/);
  assert.match(offlineReview, /listReadyOfflineIssuedInstances/);
  assert.match(offlineReview, /readVerifiedOfflineAssetBytes/);
  assert.match(offlineReview, /findOfflineAttemptByInstanceId/);
  assert.match(offlineReview, /recoverSendingOfflineAttempts/);
  assert.match(offlineReview, /PilotOutboxForegroundSync/);
  assert.doesNotMatch(offlineReview, /prefetchPilotOfflineInstance|api\/snapshots|api\/review\/pilot\/prefetch/);
  assert.doesNotMatch(offlineReview, /deleteDatabase/);
});

test("mirror never becomes attempt or SRS authority", () => {
  assert.match(reviewSession, /syncObjectiveStateMirror/);
  assert.doesNotMatch(reviewSession, /objectiveStateMirror.*requestBody|mirror.*selfEvaluation|mirror.*isCorrect/);
  assert.match(offlineReview, /outbox|findOfflineAttemptByInstanceId/);
});

test("pilot completion suppresses repeat while regular Review keeps it", () => {
  assert.match(reviewSession, /versionedPilotSession/);
  assert.match(reviewSession, /!versionedPilotSession/);
  assert.match(resultReconciliation, /attemptId\?:/);
  assert.match(reviewSession, /attemptId: submission\.attemptId/);
  assert.match(reviewSession, /syncStatus: ["']accepted["']/);
});

test("phase 4E-6 test command is wired", () => {
  assert.equal(typeof packageJson.scripts["test:phase4e-6"], "string");
  assert.match(packageJson.scripts["test:phase4e-6"], /phase4e-6-contract/);
});
