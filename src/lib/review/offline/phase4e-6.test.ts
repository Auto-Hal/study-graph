import assert from "node:assert/strict";
import test from "node:test";
import { adoptObjectiveStateMirror, type ObjectiveStateMirror } from "./model.ts";
import { isOfflinePilotInstanceOfferable } from "./offline-card.ts";
import {
  extractOfflineShellDependencyUrls,
  OFFLINE_APP_SHELL_CACHE_NAME,
  OFFLINE_SHELL_ACTIVATION_TIMEOUT_MS,
  OFFLINE_SERVICE_WORKER_PATH,
  waitForOfflineServiceWorkerActivation,
} from "./service-worker.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";
import { reconcilePilotResult } from "./result-reconciliation.ts";
import type { PersistedOfflineAttempt } from "./attempt-outbox.ts";

function mirror(overrides: Partial<ObjectiveStateMirror> = {}): ObjectiveStateMirror {
  return {
    learnerId: "00000000-0000-4000-8000-000000000001",
    projectId: "kuzushiji",
    objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
    srsEpoch: 1,
    stateRevision: 1,
    dueAt: "2030-01-02T00:00:00.000Z",
    intervalDays: 1,
    repetitions: 1,
    lastGrade: "good",
    lastReviewedAt: "2030-01-01T00:00:00.000Z",
    schedulerVersion: "legacy-v1",
    ...overrides,
  };
}

function snapshot(generation: number, status: "eligible" | "ineligible" | "unknown"): ScopeKnowledgeSnapshot {
  return {
    snapshotId: `snapshot-${generation}`,
    schemaVersion: 1,
    projectId: "kuzushiji",
    generation,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
    publishedAt: "2030-01-01T00:02:00.000Z",
    validUntil: "2030-01-01T02:01:00.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "kuzushiji-v1",
    sourceEvidence: { sourceIdentifiers: [], paginationComplete: true, relationCompleteness: true },
    scopeDecisions: [{
      subjectId: "3ccd2793-4134-815f-95f0-cc64dcdb86c7",
      status,
      reasonCodes: [],
      anchorReferences: [],
    }],
    knowledgeProjection: { lectures: [], characters: [], mistakes: [], reviewQueue: [] },
    contentHash: "a".repeat(64),
  };
}

test("Objective mirror state revision is monotonic and epoch-scoped", () => {
  assert.deepEqual(adoptObjectiveStateMirror(null, mirror()), { kind: "adopt", reason: "no-current" });
  assert.deepEqual(adoptObjectiveStateMirror(mirror({ stateRevision: 2 }), mirror({ stateRevision: 1 })), {
    kind: "ignore",
    reason: "older-revision",
  });
  assert.deepEqual(adoptObjectiveStateMirror(mirror(), mirror({ stateRevision: 2 })), {
    kind: "adopt",
    reason: "newer-revision",
  });
  assert.deepEqual(adoptObjectiveStateMirror(mirror(), mirror()), { kind: "idempotent", reason: "same-revision" });
  assert.deepEqual(adoptObjectiveStateMirror(mirror(), mirror({ dueAt: "2031-01-01T00:00:00.000Z" })), {
    kind: "conflict",
    reason: "same-revision-different-content",
  });
  assert.deepEqual(adoptObjectiveStateMirror(mirror(), mirror({ srsEpoch: 2 })), { kind: "conflict", reason: "different-key" });
});

test("newer explicit Scope exclusion gates only unstarted offline cards", () => {
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot(2, "ineligible")), false);
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot(2, "eligible")), true);
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot(2, "unknown")), true);
  assert.equal(isOfflinePilotInstanceOfferable(2, snapshot(1, "ineligible")), true);
  assert.equal(isOfflinePilotInstanceOfferable(1, null), true);
});

test("offline shell dependency extraction excludes APIs and login", () => {
  const urls = extractOfflineShellDependencyUrls(`
    <script src="/_next/static/chunks/app/offline-review/page.js"></script>
    <link href="/_next/static/css/app.css" rel="stylesheet">
    <script src="/api/private.js"></script>
    <a href="/login">login</a>
  `);
  assert.deepEqual(urls, ["/_next/static/chunks/app/offline-review/page.js", "/_next/static/css/app.css", "/icon.svg", "/manifest.webmanifest", OFFLINE_SERVICE_WORKER_PATH].sort());
});

test("offline shell uses a dedicated owned cache namespace", () => {
  assert.equal(OFFLINE_APP_SHELL_CACHE_NAME, "study-graph-app-shell-v1");
  assert.equal(OFFLINE_SERVICE_WORKER_PATH, "/study-graph-sw.js");
  assert.equal(OFFLINE_SHELL_ACTIVATION_TIMEOUT_MS, 15_000);
});

class TestWorker extends EventTarget {
  state: ServiceWorkerState;
  readonly scriptURL = "https://study-graph.test/study-graph-sw.js";

  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }

  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

function registrationFor(worker: TestWorker): ServiceWorkerRegistration {
  return {
    active: worker.state === "activated" ? worker : null,
    installing: worker.state === "activated" ? null : worker,
    waiting: null,
  } as unknown as ServiceWorkerRegistration;
}

test("shell readiness waits for activation rather than registration resolution", async () => {
  const worker = new TestWorker("installing");
  const registration = registrationFor(worker);
  const readiness = waitForOfflineServiceWorkerActivation(registration, undefined, 100);
  assert.equal(await Promise.race([readiness, Promise.resolve(false)]), false);
  worker.state = "activated";
  (registration as unknown as { active: TestWorker | null; installing: TestWorker | null }).active = worker;
  (registration as unknown as { active: TestWorker | null; installing: TestWorker | null }).installing = null;
  worker.dispatchEvent(new Event("statechange"));
  assert.equal(await readiness, true);
});

test("activation timeout fails closed", async () => {
  const worker = new TestWorker("installing");
  assert.equal(await waitForOfflineServiceWorkerActivation(registrationFor(worker), undefined, 1), false);
});

const result = {
  id: "offline-instance",
  attemptId: "11111111-1111-4111-8111-111111111111",
  grade: "good" as const,
  saved: false,
  dueAt: null,
  correct: true,
  syncStatus: "pending" as const,
};

function persisted(status: "accepted-applied" | "accepted-no-srs" | "pending", receipt: Record<string, unknown> | null): PersistedOfflineAttempt {
  return {
    attemptId: result.attemptId!,
    instanceId: "22222222-2222-4222-8222-222222222222",
    record: {
      status,
      submission: {
        submissionSchemaVersion: 1,
        requestHashVersion: 1,
        attemptId: result.attemptId!,
        instanceId: "22222222-2222-4222-8222-222222222222",
        rawAnswer: "あ",
        selfEvaluation: "good",
        responseMs: 100,
        usedHint: false,
      },
      requestHash: "a".repeat(64),
      localMetadata: {},
      receipt: receipt ? { descriptorVersion: 1, kind: "legacy", receipt } : null,
      blockedReason: null,
    },
    transport: { createdAt: "2030-01-01T00:00:00.000Z", updatedAt: "2030-01-01T00:00:00.000Z", lastAttemptedAt: null, retryCount: 0, lastTransportError: null },
  } as PersistedOfflineAttempt;
}

function storedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptVersion: 1,
    attemptId: result.attemptId,
    instanceId: "22222222-2222-4222-8222-222222222222",
    acceptedAt: "2030-01-01T00:00:00.000Z",
    gradingStatus: "graded",
    isCorrect: false,
    effectiveSrsGrade: "again",
    srsApplied: true,
    srsReason: "applied",
    legacyReviewAttemptId: 1,
    reviewStateBefore: null,
    reviewStateAfter: { due_at: "2030-01-03T00:00:00.000Z" },
    ...overrides,
  };
}

test("background reconciliation uses the authoritative stored receipt", () => {
  const reconciled = reconcilePilotResult(result, persisted("accepted-applied", storedReceipt()));
  assert.equal(reconciled.saved, true);
  assert.equal(reconciled.syncStatus, "accepted");
  assert.equal(reconciled.correct, false);
  assert.equal(reconciled.dueAt, "2030-01-03T00:00:00.000Z");
  assert.equal(reconciled.srsApplied, true);
});

test("accepted-no-srs remains accepted without a schedule update", () => {
  const reconciled = reconcilePilotResult(result, persisted("accepted-no-srs", storedReceipt({
    isCorrect: true,
    effectiveSrsGrade: null,
    srsApplied: false,
    srsReason: "scope-not-eligible",
    reviewStateAfter: null,
  })));
  assert.equal(reconciled.saved, true);
  assert.equal(reconciled.syncStatus, "accepted");
  assert.equal(reconciled.srsApplied, false);
  assert.equal(reconciled.dueAt, null);
});

test("malformed terminal receipt never becomes accepted", () => {
  const reconciled = reconcilePilotResult(result, persisted("accepted-applied", null));
  assert.equal(reconciled.saved, false);
  assert.equal(reconciled.syncStatus, "blocked");
});
