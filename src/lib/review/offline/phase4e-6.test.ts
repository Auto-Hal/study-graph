import assert from "node:assert/strict";
import test from "node:test";
import { adoptObjectiveStateMirror, type ObjectiveStateMirror } from "./model.ts";
import { isOfflinePilotInstanceOfferable } from "./offline-card.ts";
import {
  extractOfflineShellDependencyUrls,
  OFFLINE_APP_SHELL_CACHE_NAME,
  OFFLINE_SERVICE_WORKER_PATH,
} from "./service-worker.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";

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
});
