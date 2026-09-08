import assert from "node:assert/strict";
import test from "node:test";
import {
  createScopeKnowledgeSnapshot,
  hashScopeKnowledgeSnapshotContent,
  type ScopeKnowledgeSnapshot,
} from "./snapshot.ts";
import {
  hashScopeKnowledgeSnapshotContentBrowser,
  isScopeKnowledgeSnapshotHashValidBrowser,
} from "./snapshot-browser.ts";

function snapshot(overrides: Partial<Omit<ScopeKnowledgeSnapshot, "schemaVersion" | "contentHash">> = {}): ScopeKnowledgeSnapshot {
  return createScopeKnowledgeSnapshot({
    snapshotId: "11111111-1111-4111-8111-111111111111",
    projectId: "kuzushiji",
    generation: 1,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
    publishedAt: "2030-01-01T00:01:01.000Z",
    validUntil: "2030-01-01T02:01:00.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "kuzushiji-v1",
    sourceEvidence: {
      sourceIdentifiers: ["notion:characters", "notion:lectures"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [{
      subjectId: "character-a",
      status: "eligible",
      reasonCodes: ["mastery-eligible", "direct-relation"],
      anchorReferences: ["lecture-1", "lecture-2"],
    }],
    knowledgeProjection: { rows: ["first", "second"] },
    ...overrides,
  });
}

test("browser Web Crypto hash equals server hash and validates the known vector", async () => {
  const value = snapshot();
  assert.equal(await hashScopeKnowledgeSnapshotContentBrowser(value), hashScopeKnowledgeSnapshotContent(value));
  assert.equal(await isScopeKnowledgeSnapshotHashValidBrowser(value), true);
});

test("observation metadata does not affect browser semantic hash", async () => {
  const first = snapshot();
  const second = snapshot({
    snapshotId: "22222222-2222-4222-8222-222222222222",
    generation: 9,
    sourceReadStartedAt: "2040-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2040-01-01T00:01:00.000Z",
    publishedAt: "2040-01-01T00:01:01.000Z",
    validUntil: "2040-01-01T02:01:00.000Z",
  });
  assert.equal(await hashScopeKnowledgeSnapshotContentBrowser(first), await hashScopeKnowledgeSnapshotContentBrowser(second));
});

test("snapshot set-like ordering is normalized while projection array order remains semantic", async () => {
  const first = snapshot();
  const reordered = snapshot({
    sourceEvidence: {
      sourceIdentifiers: ["notion:lectures", "notion:characters"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [{
      subjectId: "character-a",
      status: "eligible",
      reasonCodes: ["direct-relation", "mastery-eligible"],
      anchorReferences: ["lecture-2", "lecture-1"],
    }],
  });
  assert.equal(await hashScopeKnowledgeSnapshotContentBrowser(first), await hashScopeKnowledgeSnapshotContentBrowser(reordered));

  const changedProjection = snapshot({ knowledgeProjection: { rows: ["second", "first"] } });
  assert.notEqual(await hashScopeKnowledgeSnapshotContentBrowser(first), await hashScopeKnowledgeSnapshotContentBrowser(changedProjection));
});

test("semantic snapshot changes alter the browser hash", async () => {
  const first = snapshot();
  assert.notEqual(await hashScopeKnowledgeSnapshotContentBrowser(first), await hashScopeKnowledgeSnapshotContentBrowser(snapshot({
    scopePolicyVersion: "phase4b-v2",
  })));
  assert.notEqual(await hashScopeKnowledgeSnapshotContentBrowser(first), await hashScopeKnowledgeSnapshotContentBrowser(snapshot({
    scopeDecisions: [{ ...first.scopeDecisions[0], status: "unknown" }],
  })));
});
