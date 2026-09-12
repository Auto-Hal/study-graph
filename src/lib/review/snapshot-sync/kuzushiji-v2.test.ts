import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import type { KuzushijiExpression, KuzushijiSource } from "../../notion/kuzushiji-reference.ts";
import {
  decodeKuzushijiV2Projection,
  type KuzushijiV2Projection,
  type ProjectProjectionCompleteness,
} from "../../projects/project-projections.ts";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  toScopeKnowledgeSnapshot,
} from "../../projects/read-contract.ts";
import {
  canonicalizeScopeKnowledgeSnapshotContent,
} from "../offline/snapshot-content.ts";
import {
  hashScopeKnowledgeSnapshotContent,
  isScopeKnowledgeSnapshotHashValid,
} from "../offline/snapshot.ts";
import {
  createKuzushijiScopeKnowledgeSnapshot,
  createKuzushijiV2ScopeKnowledgeSnapshot,
} from "./model.ts";
import type { KuzushijiSnapshotSource } from "../../notion/kuzushiji-snapshot-source.ts";
import { KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from "../../projects/project-projections.ts";

const times = {
  sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
  sourceReadCompletedAt: "2030-01-01T00:10:00.000Z",
  publishedAt: "2030-01-01T00:10:01.000Z",
};

const lecture: Lecture = {
  id: "lecture-a",
  url: "https://notion.example/lecture-a",
  title: "講義",
  sequence: 1,
  theme: "字形",
  status: "公開",
  completedAt: null,
  reviewAccuracy: null,
  newCharactersCount: 1,
};

const character: Character = {
  id: "character-a",
  url: "https://notion.example/character-a",
  glyph: "あ",
  reading: "あ",
  mother: "安",
  category: "変体仮名",
  mastery: "学習中",
  importance: "A",
  errorCount: 1,
  lastReviewedAt: null,
};

const mistake: Mistake = {
  id: "mistake-a",
  url: "https://notion.example/mistake-a",
  title: "誤読",
  answer: "い",
  correctAnswer: "あ",
  cause: "字形",
  retry: true,
  resolved: false,
  errorDate: null,
};

const source: KuzushijiSource = {
  id: "source-a",
  url: "https://notion.example/source-a",
  title: "資料",
  usage: "教材",
  materialType: "版本",
  difficulty: "入門",
  period: "江戸",
  era: "18世紀",
  institution: "国文学研究資料館",
  referenceUrl: "https://example.test/source",
  readingAccuracy: null,
  weakPoint: "",
};

const expression: KuzushijiExpression = {
  id: "expression-a",
  url: "https://notion.example/expression-a",
  expression: "候",
  reading: "そうろう",
  category: "候文",
  meaning: "丁寧な言い回し",
  example: "参り候",
  notes: "",
  mastery: "学習中",
  importance: "A",
};

const relations = [
  { id: "lecture-a:character-a:lecture-character", sourceEntityId: "lecture-a", targetEntityId: "character-a", kind: "lecture-character", label: "重要・弱点字" },
  { id: "lecture-a:mistake-a:lecture-mistake", sourceEntityId: "lecture-a", targetEntityId: "mistake-a", kind: "lecture-mistake", label: "誤読記録" },
  { id: "lecture-a:source-a:lecture-source", sourceEntityId: "lecture-a", targetEntityId: "source-a", kind: "lecture-source", label: "使用資料" },
  { id: "lecture-a:expression-a:lecture-expression", sourceEntityId: "lecture-a", targetEntityId: "expression-a", kind: "lecture-expression", label: "頻出表現" },
  { id: "mistake-a:character-a:mistake-character", sourceEntityId: "mistake-a", targetEntityId: "character-a", kind: "mistake-character", label: "関連文字" },
  { id: "mistake-a:source-a:mistake-source", sourceEntityId: "mistake-a", targetEntityId: "source-a", kind: "mistake-source", label: "関連資料" },
] as const;

const relationProperties = [
  { sourceEntityId: "lecture-a", ownerKind: "lecture", propertyName: "重要・弱点字", relationKind: "lecture-character", itemCount: 1, paginationComplete: true },
  { sourceEntityId: "lecture-a", ownerKind: "lecture", propertyName: "誤読記録", relationKind: "lecture-mistake", itemCount: 1, paginationComplete: true },
  { sourceEntityId: "lecture-a", ownerKind: "lecture", propertyName: "使用資料", relationKind: "lecture-source", itemCount: 1, paginationComplete: true },
  { sourceEntityId: "lecture-a", ownerKind: "lecture", propertyName: "頻出表現", relationKind: "lecture-expression", itemCount: 1, paginationComplete: true },
  { sourceEntityId: "mistake-a", ownerKind: "mistake", propertyName: "関連文字", relationKind: "mistake-character", itemCount: 1, paginationComplete: true },
  { sourceEntityId: "mistake-a", ownerKind: "mistake", propertyName: "関連資料", relationKind: "mistake-source", itemCount: 1, paginationComplete: true },
] as const;

function completeness(overrides: Partial<ProjectProjectionCompleteness> = {}): ProjectProjectionCompleteness {
  return {
    dataSources: [
      { sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[0], itemCount: 1, paginationComplete: true },
      { sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[1], itemCount: 1, paginationComplete: true },
      { sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[2], itemCount: 1, paginationComplete: true },
      { sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[3], itemCount: 1, paginationComplete: true },
      { sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[4], itemCount: 1, paginationComplete: true },
    ],
    relationProperties: [...relationProperties],
    unresolvedTargets: [],
    ...overrides,
  };
}

function projection(overrides: Partial<KuzushijiV2Projection> = {}): KuzushijiV2Projection {
  return {
    lectures: [lecture],
    characters: [character],
    mistakes: [mistake],
    sources: [source],
    expressions: [expression],
    reviewQueue: [],
    relations: [...relations],
    completeness: completeness(),
    ...overrides,
  };
}

function v2Source(value = projection()) {
  return {
    projection: value,
    sourceIdentifiers: [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS],
    paginationComplete: true as const,
    relationCompleteness: true as const,
  };
}

function build(value = projection()) {
  return createKuzushijiV2ScopeKnowledgeSnapshot({
    source: v2Source(value),
    snapshotId: "11111111-1111-4111-8111-111111111111",
    generation: 2,
    ...times,
  });
}

test("valid Kuzushiji v2 snapshot strictly decodes and round-trips to the historical model", () => {
  const snapshot = build();
  assert.equal(snapshot.knowledgeProjectionVersion, "kuzushiji-v2");
  assert.equal(snapshot.scopePolicyVersion, "phase4b-v1");
  assert.equal(isScopeKnowledgeSnapshotHashValid(snapshot), true);
  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(snapshot));
  assert.equal(decoded.projectionVersion, "kuzushiji-v2");
  const roundTrip = toScopeKnowledgeSnapshot(decoded);
  assert.equal(roundTrip.contentHash, snapshot.contentHash);
  assert.equal(hashScopeKnowledgeSnapshotContent(roundTrip), snapshot.contentHash);
  assert.equal(canonicalizeScopeKnowledgeSnapshotContent(roundTrip), canonicalizeScopeKnowledgeSnapshotContent(snapshot));
  assert.deepEqual(roundTrip.scopeDecisions, snapshot.scopeDecisions);
});

test("v2 rejects a well-shaped but incorrect content hash before returning trusted data", () => {
  const candidate = { ...adaptScopeKnowledgeSnapshot(build()), contentHash: "0".repeat(64) };
  assert.throws(
    () => decodeProjectReadSnapshot(candidate),
    (error) => error instanceof Error && "code" in error && error.code === "invalid-content-hash",
  );
});

test("v2 projection keeps all five source identifiers and six directional relation identities", () => {
  const snapshot = build();
  const value = snapshot.knowledgeProjection as Record<string, unknown>;
  assert.deepEqual(
    (value.relations as Array<{ id: string }>).map((item) => item.id),
    relations.map((item) => item.id).sort(),
  );
  assert.deepEqual((value.completeness as { dataSources: Array<{ sourceIdentifier: string }> }).dataSources.map((item) => item.sourceIdentifier).sort(), [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS].sort());
  assert.equal((value.completeness as { relationProperties: unknown[] }).relationProperties.length, 6);
});

test("v2 decoder rejects unknown fields at every new projection layer", () => {
  const base = projection();
  const cases: unknown[] = [
    { ...base, future: true },
    { ...base, lectures: [{ ...lecture, future: true }] },
    { ...base, characters: [{ ...character, future: true }] },
    { ...base, mistakes: [{ ...mistake, future: true }] },
    { ...base, sources: [{ ...source, future: true }] },
    { ...base, expressions: [{ ...expression, future: true }] },
    { ...base, reviewQueue: [{ id: "character-a", kind: "character", label: "", reason: "", future: true }] },
    { ...base, relations: [{ ...relations[0], future: true }] },
    { ...base, completeness: { ...base.completeness, future: true } },
  ];
  for (const candidate of cases) {
    assert.throws(() => decodeKuzushijiV2Projection(candidate), /not supported in this projection version/);
  }
});

test("v2 rejects a relation target outside the five observed collections", () => {
  assert.throws(
    () => build(projection({
      relations: [{ ...relations[0], targetEntityId: "missing", id: "lecture-a:missing:lecture-character" }],
    })),
    /relation contract|entity id|projection/,
  );
});

test("v2 rejects duplicate relation completeness identities", () => {
  assert.throws(
    () => build(projection({
      completeness: completeness({ relationProperties: [...relationProperties, relationProperties[0]] }),
    })),
    /relation completeness evidence is duplicated|duplicates another relation property evidence record/,
  );
});

test("source and relation response ordering does not change v2 projection or content hash", () => {
  const first = build();
  const reversed = build(projection({
    lectures: [lecture],
    characters: [character],
    mistakes: [mistake],
    sources: [source],
    expressions: [expression],
    relations: [...relations].reverse(),
    completeness: completeness({
      dataSources: [...completeness().dataSources].reverse(),
      relationProperties: [...relationProperties].reverse(),
    }),
  }));
  assert.deepEqual(reversed.knowledgeProjection, first.knowledgeProjection);
  assert.equal(reversed.contentHash, first.contentHash);
});

test("v2 decoder requires relation completeness itemCount to match decoded directional relations", () => {
  for (const itemCount of [0, 2]) {
    const candidate = projection({
      completeness: completeness({
        relationProperties: relationProperties.map((item, index) => index === 0 ? { ...item, itemCount } : item),
      }),
    });
    assert.throws(
      () => decodeKuzushijiV2Projection(candidate),
      /does not match the decoded directional relations/,
    );
  }
});

test("v2 decoder accepts an empty relation property when evidence is zero", () => {
  const candidate = projection({
    relations: relations.slice(1),
    completeness: completeness({
      relationProperties: relationProperties.map((item, index) => index === 0 ? { ...item, itemCount: 0 } : item),
    }),
  });
  assert.doesNotThrow(() => decodeKuzushijiV2Projection(candidate));
});

test("changing valid hash-covered relation completeness changes content hash", () => {
  const first = build();
  const second = build(projection({
    relations: relations.slice(1),
    completeness: completeness({
      relationProperties: relationProperties.map((item, index) => index === 0 ? { ...item, itemCount: 0 } : item),
    }),
  }));
  assert.notEqual(second.contentHash, first.contentHash);
  assert.equal(isScopeKnowledgeSnapshotHashValid(second), true);
});

test("v1 Scope decisions remain identical to v2 for the same Character observation", () => {
  const v1Source: KuzushijiSnapshotSource = {
    lectures: [lecture],
    characters: [character],
    mistakes: [mistake],
    paginationComplete: true,
    relationCompleteness: true,
    sourceIdentifiers: ["lectures", "characters", "mistakes"],
  };
  const v1 = createKuzushijiScopeKnowledgeSnapshot({ source: v1Source, snapshotId: "22222222-2222-4222-8222-222222222222", generation: 1, ...times });
  const v2 = build();
  assert.deepEqual(v2.scopeDecisions, v1.scopeDecisions);
});

test("v2 keeps the existing review queue business rule", () => {
  const snapshot = build();
  const queue = (snapshot.knowledgeProjection as { reviewQueue: Array<{ id: string }> }).reviewQueue;
  assert.deepEqual(queue.map((item) => item.id), ["mistake-a", "character-a"]);
});

test("v2 project/version mismatch remains fail closed", () => {
  const neutral = adaptScopeKnowledgeSnapshot(build());
  assert.throws(() => decodeProjectReadSnapshot({ ...neutral, projectId: "western-art-history" }), /cannot use kuzushiji-v2|mismatch/);
  assert.throws(() => decodeProjectReadSnapshot({ ...neutral, projectionVersion: "kuzushiji-v9" }), /unsupported projectionVersion/);
});
