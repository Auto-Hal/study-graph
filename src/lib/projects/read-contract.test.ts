import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  validateProjectReadSnapshot,
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
  isScopeKnowledgeSnapshotHashValid,
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

function snapshotWithProjection(projection: ScopeKnowledgeSnapshot["knowledgeProjection"]) {
  const base = snapshot();
  const { contentHash: _contentHash, ...input } = base;
  return createScopeKnowledgeSnapshot({ ...input, knowledgeProjection: projection });
}

test("historical Kuzushiji v1 snapshot adapts and dispatches through the neutral read contract", () => {
  const legacy = snapshot();
  const neutral = adaptScopeKnowledgeSnapshot(legacy);
  const decoded = decodeProjectReadSnapshot(neutral);

  // The decoder now returns a discriminated union for all supported project
  // projections.  This fixture exercises the historical Kuzushiji branch.
  if (decoded.projectId !== "kuzushiji" || decoded.projectionVersion !== "kuzushiji-v1") {
    throw new Error("expected a Kuzushiji v1 snapshot");
  }

  assert.equal(neutral.projectId, "kuzushiji");
  assert.equal(neutral.projectionVersion, "kuzushiji-v1");
  assert.equal(decoded.projection.lectures[0]?.title, "講義");
  assert.equal(decoded.projection.characters[0]?.glyph, "あ");
  assert.equal(decoded.contentHash, legacy.contentHash);
  const roundTripped = toScopeKnowledgeSnapshot(decoded);
  assert.equal(hashScopeKnowledgeSnapshotContent(roundTripped), legacy.contentHash);
  assert.equal(isScopeKnowledgeSnapshotHashValid(roundTripped), true);
  assert.equal(canonicalizeScopeKnowledgeSnapshotContent(roundTripped), canonicalizeScopeKnowledgeSnapshotContent(legacy));
  assert.deepEqual(validateProjectReadProjection("kuzushiji", "kuzushiji-v1", neutral.projection), []);
  assert.deepEqual(Object.keys(neutral.sourceEvidence).sort(), ["paginationComplete", "relationCompleteness", "sourceIdentifiers"]);
});

test("a valid-shaped but incorrect content hash fails closed", () => {
  const candidate = { ...adaptScopeKnowledgeSnapshot(snapshot()), contentHash: "0".repeat(64) };
  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    (error) => error instanceof Error && "code" in error && error.code === "invalid-content-hash",
  );
  assert.match(validateProjectReadSnapshot(candidate).join("; "), /contentHash does not match/);
});

test("source evidence extra fields are rejected even when the historical hash still validates", () => {
  const base = adaptScopeKnowledgeSnapshot(snapshot());
  const candidate = {
    ...base,
    sourceEvidence: {
      ...base.sourceEvidence,
      relationCoverageDetails: { crawledPages: 3 },
    },
  };

  assert.equal(isScopeKnowledgeSnapshotHashValid(toScopeKnowledgeSnapshot(candidate)), true);
  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    /sourceEvidence\.relationCoverageDetails is not supported in this projection version/,
  );
});

test("subject observation extra fields are rejected even when the historical hash still validates", () => {
  const base = adaptScopeKnowledgeSnapshot(snapshot());
  const candidate = {
    ...base,
    subjectObservations: base.subjectObservations.map((observation) => ({
      ...observation,
      currentAuthority: true,
    })),
  };

  assert.equal(isScopeKnowledgeSnapshotHashValid(toScopeKnowledgeSnapshot(candidate)), true);
  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    /subjectObservations\[0\]\.currentAuthority is not supported in this projection version/,
  );
});

test("Kuzushiji v1 rejects unknown semantic projection fields instead of dropping them", () => {
  const base = snapshot();
  const projection = base.knowledgeProjection as Record<string, unknown>;
  const candidate = adaptScopeKnowledgeSnapshot(snapshotWithProjection({
    ...projection,
    futureItems: [],
  } as ScopeKnowledgeSnapshot["knowledgeProjection"]));

  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    /projection\.futureItems is not supported in this projection version/,
  );
});

test("Kuzushiji v1 rejects unknown fields nested in a lecture", () => {
  const base = snapshot();
  const projection = base.knowledgeProjection as Record<string, unknown>;
  const lectures = projection.lectures as readonly Record<string, unknown>[];
  const candidate = adaptScopeKnowledgeSnapshot(snapshotWithProjection({
    ...projection,
    lectures: [{ ...lectures[0], futureLabel: "追加情報" }],
  } as ScopeKnowledgeSnapshot["knowledgeProjection"]));

  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    /projection\.lectures\[0\]\.futureLabel is not supported in this projection version/,
  );
});

test("Kuzushiji v1 rejects unknown fields in every supported entity shape", () => {
  const base = snapshot();
  const projection = base.knowledgeProjection as Record<string, unknown>;
  const character = (projection.characters as readonly Record<string, unknown>[])[0];
  const reviewItem = (projection.reviewQueue as readonly Record<string, unknown>[])[0];
  const cases = [
    {
      path: "characters[0].futureLabel",
      value: { ...projection, characters: [{ ...character, futureLabel: "追加情報" }] },
    },
    {
      path: "mistakes[0].futureLabel",
      value: {
        ...projection,
        mistakes: [{
          id: "mistake-a",
          url: "https://example.test/mistake-a",
          title: "誤読",
          answer: "い",
          correctAnswer: "あ",
          cause: "字形",
          retry: false,
          resolved: false,
          errorDate: null,
          futureLabel: "追加情報",
        }],
      },
    },
    {
      path: "reviewQueue[0].futureLabel",
      value: { ...projection, reviewQueue: [{ ...reviewItem, futureLabel: "追加情報" }] },
    },
  ] as const;

  for (const { path, value } of cases) {
    const candidate = adaptScopeKnowledgeSnapshot(
      snapshotWithProjection(value as unknown as ScopeKnowledgeSnapshot["knowledgeProjection"]),
    );
    assert.throws(
      () => decodeProjectReadSnapshot(candidate),
      new RegExp(`projection\\.${path.replace("[", "\\[").replace("]", "\\]")} is not supported`),
    );
  }
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
    () => decodeProjectReadSnapshot({ ...base, projectionVersion: "kuzushiji-v9" }),
    /unsupported projectionVersion/,
  );
  assert.throws(
    () => decodeProjectReadSnapshot({ ...base, projectId: "western-art-history", projectionVersion: "kuzushiji-v2" }),
    /project-projection|cannot use/,
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
