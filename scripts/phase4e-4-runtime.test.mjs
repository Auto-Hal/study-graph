import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("Phase 4E-4 has a separate attempt outbox database and receipt store", () => {
  const source = read("src/lib/review/offline/attempt-outbox.ts");
  assert.match(source, /study-graph-attempt-outbox/);
  assert.match(source, /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(source, /attempt_outbox/);
  assert.match(source, /attempt_receipts/);
  assert.match(source, /createIndex\(ATTEMPT_OUTBOX_INSTANCE_INDEX, "instanceId", \{ unique: true \}\)/);
});

test("pilot transport commits durably before POST and sends only immutable submission fields", () => {
  const transport = read("src/lib/review/offline/pilot-transport.ts");
  assert.ok(transport.indexOf("commitOfflineAttempt") < transport.indexOf("sendPilotOutboxAttempt"));
  assert.match(transport, /markOfflineAttemptSending/);
  assert.match(transport, /\/api\/review\/pilot\/attempt/);
  assert.doesNotMatch(transport.slice(transport.indexOf("function requestBody"), transport.indexOf("function resultForAccepted")), /isCorrect|srsApplied|scopeAccepted|learnerId/);
  const session = read("src/components/ReviewSession.tsx");
  assert.doesNotMatch(session, /fetch\("\/api\/review\/pilot\/attempt"/);
  assert.match(session, /commitPilotOfflineAttempt/);
});

test("browser hash uses Web Crypto while server request hash exports remain intact", () => {
  const browser = read("src/lib/review/exercises/attempt-browser.ts");
  const server = read("src/lib/review/exercises/attempt.ts");
  assert.match(browser, /subtle\.digest\("SHA-256"/);
  assert.match(server, /export function hashExerciseAttemptRequest/);
  assert.match(server, /export \{ canonicalizeExerciseAttemptRequest \}/);
});

test("receipt lookup is authenticated, read-only, and server-derived", () => {
  const route = read("app/api/review/pilot/receipt/route.ts");
  assert.match(route, /isPilotSessionRequestAuthenticated/);
  assert.match(route, /resolveKuzushijiPilotInstance/);
  assert.match(route, /getKuzushijiPilotAttemptReceipt/);
  assert.match(route, /receiptKind: instance\.srs_target/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /getKuzushijiDashboard|gradeExerciseRevision|recordKuzushiji/);
});

test("Phase 4E-4 leaves database migrations and non-pilot writer untouched", () => {
  const session = read("src/components/ReviewSession.tsx");
  assert.match(session, /fetch\("\/api\/review\/attempt"/);
  assert.match(session, /syncStatus: "auth-required"/);
  assert.match(session, /syncStatus: "blocked"/);
  assert.match(session, /href="\/login"/);
  assert.match(session, /outboxCounts\.authRequired/);
  assert.match(session, /outboxCounts\.blocked/);
  assert.match(session, /countOfflineAttemptStatuses/);
  const docs = read("docs/PHASE_4E_4_DURABLE_ATTEMPT_OUTBOX.md");
  assert.match(docs, /durable-before-send/i);
  assert.match(docs, /no SRS semantics change/);
  assert.match(docs, /rollback/i);
});

test("Review attention counts use the current durable outbox authority", () => {
  const session = read("src/components/ReviewSession.tsx");
  assert.match(session, /async function refreshOutboxCounts/);
  assert.match(session, /const displayedPendingCount = outboxCounts\.pending/);
  assert.match(session, /const displayedAuthRequiredCount = outboxCounts\.authRequired/);
  assert.match(session, /const displayedBlockedCount = outboxCounts\.blocked/);
  assert.doesNotMatch(session, /Math\.max\(outboxCounts\./);
  assert.doesNotMatch(session, /setOutboxCounts\(\(counts\)/);
  assert.doesNotMatch(session, /results\.filter\(\(result\) => result\.syncStatus === "pending"\)/);
  assert.match(session, /端末保存済み・未同期/);
  assert.match(session, /ログイン待ち/);
  assert.match(session, /確認が必要/);
});

test("auth recovery and stored receipt identity checks fail closed", () => {
  const transport = read("src/lib/review/offline/pilot-transport.ts");
  const outbox = read("src/lib/review/offline/outbox-core.ts");
  assert.match(transport, /probeAuthentication/);
  assert.match(transport, /response\.status === 404/);
  assert.match(transport, /response\.status === 401/);
  assert.match(transport, /auth-required/);
  assert.match(outbox, /typeof lookup\.requestHash !== "string"/);
  assert.match(outbox, /lookup\.requestHash !== context\.requestHash/);
  assert.match(outbox, /lookup\.attemptId !== context\.attemptId/);
});
