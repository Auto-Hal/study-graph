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
const dashboard = read("src/components/KuzushijiSnapshotDashboard.tsx");
const attemptRoute = read("app/api/review/pilot/attempt/route.ts");
const validationRoute = read("app/api/review/pilot/attempt/validate/route.ts");
const pilotTransport = read("src/lib/review/offline/pilot-transport.ts");
const attemptOutbox = read("src/lib/review/offline/attempt-outbox.ts");
const diagnostics = read("src/lib/review/offline/attempt-diagnostics.ts");
const diagnosticsComponent = read("src/components/PilotBlockedAttemptDiagnostics.tsx");
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

test("objective state feed is no-login, read-only, and server-fixed", () => {
  assert.doesNotMatch(objectiveRoute, /isPilotSessionRequestAuthenticated|pilot_authorization_required/);
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
  assert.match(offlineReview, /PilotBlockedAttemptDiagnostics/);
  assert.doesNotMatch(offlineReview, /prefetchPilotOfflineInstance|api\/snapshots|api\/review\/pilot\/prefetch/);
  assert.doesNotMatch(offlineReview, /deleteDatabase/);
});

test("blocked cold-start records expose read-only diagnostics without reoffering or retrying", () => {
  assert.match(offlineReview, /findOfflineAttemptByInstanceId\(record\.instanceId\)/);
  assert.match(offlineReview, /if \(existingAttempt\)[\s\S]*?continue;/);
  const unavailableStart = offlineReview.indexOf('if (state.kind === "unavailable")');
  const returnStart = offlineReview.indexOf("\n  return (", unavailableStart);
  assert.ok(unavailableStart >= 0 && returnStart > unavailableStart);
  const unavailableBranch = offlineReview.slice(unavailableStart, returnStart);
  assert.match(unavailableBranch, /PilotBlockedAttemptDiagnostics/);
  assert.doesNotMatch(unavailableBranch, /commitPilotOfflineAttempt|sendPilotOutboxAttempt|crypto\.randomUUID/);
  assert.match(diagnosticsComponent, /listOfflineAttempts\(\)/);
  assert.match(diagnosticsComponent, /onClick/);
  assert.doesNotMatch(diagnosticsComponent, /markOfflineInstanceAnswered|deleteDatabase|transitionOfflineAttempt/);
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

test("pilot validation diagnostics are safe and read-only", () => {
  assert.match(attemptRoute, /pilot_attempt_validation_failed/);
  assert.match(attemptRoute, /parsed\.error/);
  assert.doesNotMatch(attemptRoute, /console\.(warn|error)[\s\S]*(rawAnswer|request\.body|authorization|cookie)/i);
  assert.match(validationRoute, /validatePilotAttemptInput/);
  assert.match(validationRoute, /private, no-store/);
  assert.doesNotMatch(validationRoute, /submitKuzushijiPilotAttempt|from ["'][^"']*(pilot-runtime|supabase)["']|gradeExerciseRevision|recordKuzushiji/i);
  assert.doesNotMatch(validationRoute, /\b(?:insert|update)\s*\(/i);
});

test("transport diagnostics remain outside the immutable request tuple", () => {
  assert.match(attemptOutbox, /lastHttpStatus/);
  assert.match(attemptOutbox, /lastServerErrorCode/);
  assert.match(attemptOutbox, /lastTransportObservedAt/);
  const bodyStart = pilotTransport.indexOf("export function requestBody");
  const bodyEnd = pilotTransport.indexOf("\n}", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart);
  const body = pilotTransport.slice(bodyStart, bodyEnd);
  for (const field of ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint"]) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(body, /clientAnsweredAt|clientSnapshotId|clientSnapshotGeneration|lastHttpStatus|lastServerErrorCode|retryCount/);
  assert.match(diagnostics, /listOfflineAttempts/);
  assert.match(diagnosticsComponent, /listOfflineAttempts/);
  assert.match(diagnosticsComponent, /attempt\/validate/);
  assert.match(diagnosticsComponent, /onClick/);
  assert.doesNotMatch(diagnosticsComponent, /setRawAnswer|rawAnswer\s*\}/);
});

test("blocked diagnostics are a structural, non-mutating projection", () => {
  assert.match(diagnostics, /describeOfflineAttempt/);
  assert.match(diagnostics, /rawAnswerType/);
  assert.match(diagnostics, /rawAnswerStringLength/);
  assert.match(diagnostics, /retryCount/);
  assert.match(diagnostics, /diagnosticValidationRequestBody/);
  assert.doesNotMatch(diagnostics, /put\(|delete\(|transaction\([^)]*,\s*["']readwrite["']/);
});

test("explicit blocked recovery is validation-gated and keeps the generic terminal state", () => {
  assert.match(pilotTransport, /recoverBlockedPilotAttemptExplicitly/);
  assert.match(pilotTransport, /hashExerciseAttemptRequestBrowser/);
  assert.match(pilotTransport, /\/api\/review\/pilot\/attempt\/validate/);
  assert.match(pilotTransport, /reconcileBlockedAttemptWithAuthoritativeReceipt/);
  assert.match(pilotTransport, /updateOfflineAttemptTransportMetadata/);
  const recoveryStart = pilotTransport.indexOf("export async function recoverBlockedPilotAttemptExplicitly");
  const recoveryEnd = pilotTransport.indexOf("\n/**\n * Send one durable pilot submission", recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  const recovery = pilotTransport.slice(recoveryStart, recoveryEnd);
  assert.doesNotMatch(recovery, /markOfflineAttemptSending\s*\(|markOfflineAttemptReauthenticated\s*\(|crypto\.randomUUID/);
  assert.match(recovery, /status !== ["']blocked["']/);
  assert.match(recovery, /reconcileBlockedAttemptWithAuthoritativeReceipt/);
  assert.match(diagnosticsComponent, /同じ保存済み回答を再送/);
  assert.match(diagnosticsComponent, /result\?\.ok/);
  assert.doesNotMatch(diagnosticsComponent, /sendPilotOutboxAttempt/);
});

test("dashboard reaches blocked diagnostics without changing the offline authority", () => {
  // Phase 5 moves operational controls out of the learner-facing project
  // detail. Their dedicated routes retain the same read-only authority.
  assert.doesNotMatch(dashboard, /import PilotBlockedAttemptDiagnostics/);
  assert.doesNotMatch(dashboard, /<OfflinePrefetchControl \/>/);
  assert.match(offlineReview, /PilotBlockedAttemptDiagnostics/);
  assert.match(readFileSync(resolve(root, "app/settings/advanced/diagnostics/page.tsx"), "utf8"), /PilotBlockedAttemptDiagnostics/);
  assert.match(diagnosticsComponent, /if \(loadError \|\| \(records\.length === 0 && notice === null\)\) return null/);
  assert.doesNotMatch(diagnosticsComponent, /prefetchPilotOfflineInstance|sendPilotOutboxAttempt|transitionOfflineAttempt|commitPilotOfflineAttempt|crypto\.randomUUID|markOfflineInstanceAnswered/);
  assert.match(offlineReview, /findOfflineAttemptByInstanceId\(record\.instanceId\)/);
  assert.match(offlineReview, /if \(existingAttempt\)[\s\S]*?continue;/);
});

test("phase 4E-6 test command is wired", () => {
  assert.equal(typeof packageJson.scripts["test:phase4e-6"], "string");
  assert.match(packageJson.scripts["test:phase4e-6"], /phase4e-6-contract/);
});
