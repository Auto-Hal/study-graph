import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  validateProjectReadProjection,
  type ProjectCapability,
  type ProjectReadState,
  toScopeKnowledgeSnapshot,
} from "./read-contract.ts";
import {
  canonicalizeScopeKnowledgeSnapshotContent,
  type ScopeKnowledgeSnapshot,
} from "../review/offline/snapshot-content.ts";
import {
  createScopeKnowledgeSnapshot,
  hashScopeKnowledgeSnapshotContent,
} from "../review/offline/snapshot.ts";

function snapshot(overrides: Partial<Omit<ScopeKnowledgeSnapshot, "schemaVersion" | "contentHash">> = {}) {
  return createScopeKnowledgeSnapshot({
    snapshotId: "snapshot-kuzushiji-1",
    projectId: "kuzushiji",
    generation: 1,
    sourceReadStartedAt: "2026-09-10T00:00:00.000Z",
    sourceReadCompletedAt: "2026-09-10T00:00:01.000Z",
    publishedAt: "2026-09-10T00:00:02.000Z",
    validUntil: "2026-09-10T02:00:01.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "kuzushiji-v1",
    sourceEvidence: {
      sourceIdentifiers: ["lecture-source", "character-source"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [{
      subjectId: "subject-a",
      status: "eligible",
      reasonCodes: ["source-ready"],
      anchorReferences: ["anchor-a"],
    }],
    knowledgeProjection: {
      lectures: [{
        id: "lecture-a",
        url: "https://example.test/lecture-a",
        title: "講義",
        sequence: 1,
        theme: "字形",
        status: "公開",
        completedAt: null,
        reviewAccuracy: null,
        newCharactersCount: 1,
      }],
      characters: [{
        id: "character-a",
        url: "https://example.test/character-a",
        glyph: "あ",
        reading: "あ",
        mother: "安",
        category: "変体仮名",
        mastery: "学習中",
        importance: "A",
        errorCount: 0,
        lastReviewedAt: null,
      }],
      mistakes: [],
      reviewQueue: [{
        id: "character-a",
        kind: "character",
        label: "あ",
        reason: "未学習",
      }],
    },
    ...overrides,
  });
}

test("historical Kuzushiji v1 snapshot adapts and dispatches through the neutral read contract", () => {
  const legacy = snapshot();
  const neutral = adaptScopeKnowledgeSnapshot(legacy);
  const decoded = decodeProjectReadSnapshot(neutral);

  assert.equal(neutral.projectId, "kuzushiji");
  assert.equal(neutral.projectionVersion, "kuzushiji-v1");
  assert.equal(decoded.projection.lectures[0]?.title, "講義");
  assert.equal(decoded.projection.characters[0]?.glyph, "あ");
  assert.equal(decoded.contentHash, legacy.contentHash);
  assert.equal(hashScopeKnowledgeSnapshotContent(toScopeKnowledgeSnapshot(neutral)), legacy.contentHash);
  assert.equal(canonicalizeScopeKnowledgeSnapshotContent(toScopeKnowledgeSnapshot(neutral)), canonicalizeScopeKnowledgeSnapshotContent(legacy));
  assert.deepEqual(validateProjectReadProjection("kuzushiji", "kuzushiji-v1", neutral.projection), []);
  assert.deepEqual(Object.keys(neutral.sourceEvidence).sort(), ["paginationComplete", "relationCompleteness", "sourceIdentifiers"]);
});

test("unknown and mismatched project/version pairs fail closed", () => {
  const base = adaptScopeKnowledgeSnapshot(snapshot());
  assert.throws(
    () => decodeProjectReadSnapshot({ ...base, projectId: "unknown-project" }),
    /unsupported projectId/,
  );
  assert.throws(
    () => decodeProjectReadSnapshot({ ...base, projectId: "western-art-history" }),
    /project-projection|cannot use/,
  );
  assert.throws(
    () => decodeProjectReadSnapshot({ ...base, projectionVersion: "kuzushiji-v2" }),
    /unsupported projectionVersion/,
  );
  assert.throws(
    () => decodeProjectReadSnapshot({ ...base, projectId: "philosophy", projectionVersion: "kuzushiji-v1" }),
    /project-projection|cannot use/,
  );
  assert.deepEqual(validateProjectReadProjection("western-art-history", "kuzushiji-v1", base.projection), ["project/projection version mismatch"]);
});

test("malformed Kuzushiji v1 projection fails closed instead of being coerced", () => {
  const base = adaptScopeKnowledgeSnapshot(snapshot());
  assert.throws(
    () => decodeProjectReadSnapshot({
      ...base,
      projection: { lectures: [], characters: [], mistakes: [], reviewQueue: [{ kind: "character" }] },
    }),
    /id is required/,
  );
});

test("read states keep unavailable, missing, and authoritative empty distinct", () => {
  const missing: ProjectReadState<readonly unknown[]> = { kind: "missing", reason: "not-yet-published" };
  const unavailable: ProjectReadState<readonly unknown[]> = { kind: "unavailable", errorCode: "read-timeout" };
  const authoritativeEmpty: ProjectReadState<readonly unknown[]> = {
    kind: "ready",
    data: [],
    dataStatus: "authoritative-empty",
  };
  assert.equal(missing.kind, "missing");
  assert.equal(unavailable.kind, "unavailable");
  assert.equal(authoritativeEmpty.kind, "ready");
  assert.equal(authoritativeEmpty.dataStatus, "authoritative-empty");
});

test("capability axes remain independently representable", () => {
  const capability: ProjectCapability = {
    semanticSupport: "supported",
    publishedContent: "unknown",
    runtimeAvailability: "unavailable",
    deviceReadiness: "not-ready",
  };
  assert.equal(capability.semanticSupport, "supported");
  assert.equal(capability.publishedContent, "unknown");
  assert.equal(capability.runtimeAvailability, "unavailable");
  assert.equal(capability.deviceReadiness, "not-ready");
});
