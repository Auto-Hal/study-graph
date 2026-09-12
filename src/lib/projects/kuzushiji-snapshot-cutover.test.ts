import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../notion/kuzushiji.ts";
import type { KuzushijiExpression, KuzushijiSource } from "../notion/kuzushiji-reference.ts";
import type { KuzushijiV2Projection, ProjectProjectionCompleteness } from "./project-projections.ts";
import { KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from "./project-projections.ts";
import { projectReadSnapshotToGraph } from "./project-graph.ts";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
} from "./read-contract.ts";
import {
  decodeStoredProjectReadState,
  isKuzushijiV2ProjectReadState,
  isRenderableProjectReadState,
} from "./read-runtime-core.ts";
import type { ScopeKnowledgeSnapshot } from "../review/offline/snapshot-content.ts";
import {
  createKuzushijiScopeKnowledgeSnapshot,
  createKuzushijiV2ScopeKnowledgeSnapshot,
} from "../review/snapshot-sync/model.ts";
import type { KuzushijiSnapshotSource } from "../notion/kuzushiji-snapshot-source.ts";
import type { KuzushijiV2SnapshotSource } from "../notion/kuzushiji-v2-snapshot-source.ts";
import { selectSnapshotForDisplay } from "../review/snapshot-sync/dashboard.ts";

const times = {
  sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
  sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
  publishedAt: "2030-01-01T00:01:01.000Z",
};

const lecture: Lecture = {
  id: "lecture-a",
  url: "https://example.test/lecture-a",
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
  url: "https://example.test/character-a",
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
  url: "https://example.test/mistake-a",
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
  url: "https://example.test/source-a",
  title: "資料",
  usage: "教材",
  materialType: "版本",
  difficulty: "入門",
  period: "江戸",
  era: "18世紀",
  institution: "国文学研究資料館",
  referenceUrl: "https://example.test/reference",
  readingAccuracy: null,
  weakPoint: "",
};

const expression: KuzushijiExpression = {
  id: "expression-a",
  url: "https://example.test/expression-a",
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
  ["lecture-a", "lecture", "重要・弱点字", "lecture-character"],
  ["lecture-a", "lecture", "誤読記録", "lecture-mistake"],
  ["lecture-a", "lecture", "使用資料", "lecture-source"],
  ["lecture-a", "lecture", "頻出表現", "lecture-expression"],
  ["mistake-a", "mistake", "関連文字", "mistake-character"],
  ["mistake-a", "mistake", "関連資料", "mistake-source"],
].map(([sourceEntityId, ownerKind, propertyName, relationKind]) => ({
  sourceEntityId,
  ownerKind,
  propertyName,
  relationKind,
  itemCount: 1,
  paginationComplete: true as const,
}));

function completeness(overrides: Partial<ProjectProjectionCompleteness> = {}): ProjectProjectionCompleteness {
  return {
    dataSources: KUZUSHIJI_V2_SOURCE_IDENTIFIERS.map((sourceIdentifier) => ({
      sourceIdentifier,
      itemCount: 1,
      paginationComplete: true as const,
    })),
    relationProperties,
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

function v2Snapshot(value = projection(), generation = 2): ScopeKnowledgeSnapshot {
  const source: KuzushijiV2SnapshotSource = {
    projection: value,
    sourceIdentifiers: [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS],
    paginationComplete: true,
    relationCompleteness: true,
  };
  return createKuzushijiV2ScopeKnowledgeSnapshot({
    source,
    snapshotId: generation === 2
      ? "22222222-2222-4222-8222-222222222222"
      : "11111111-1111-4111-8111-111111111111",
    generation,
    ...times,
  });
}

function v1Snapshot(): ScopeKnowledgeSnapshot {
  const source: KuzushijiSnapshotSource = {
    lectures: [lecture],
    characters: [character],
    mistakes: [mistake],
    sourceIdentifiers: ["notion:lectures", "notion:characters", "notion:mistakes"],
    paginationComplete: true,
    relationCompleteness: true,
  };
  return createKuzushijiScopeKnowledgeSnapshot({
    source,
    snapshotId: "11111111-1111-4111-8111-111111111111",
    generation: 1,
    ...times,
  });
}

test("normal Kuzushiji runtime accepts v2 and converts one snapshot to five learner node kinds", () => {
  const snapshot = v2Snapshot();
  const state = decodeStoredProjectReadState("kuzushiji", snapshot, Date.parse("2030-01-01T00:30:00.000Z"));
  assert.equal(state.kind, "ready");
  assert.equal(state.dataStatus, "available");
  assert.equal(isKuzushijiV2ProjectReadState(state), true);
  if (!isRenderableProjectReadState(state)) throw new Error("expected a renderable v2 state");

  const graph = projectReadSnapshotToGraph(state.data);
  assert.deepEqual(new Set(graph.nodes.map((node) => node.kind)), new Set(["lecture", "character", "mistake", "source", "expression"]));
  assert.deepEqual(graph.edges.map((edge) => edge.id), relations.map((relation) => relation.id).sort());
  assert.equal(graph.nodes.find((node) => node.id === "source-a")?.href, "/projects/kuzushiji/sources/source-a");
  assert.equal(graph.nodes.find((node) => node.id === "source-a")?.notionUrl, source.url);
  assert.equal(graph.edges.find((edge) => edge.id === relations[0].id)?.source, "lecture-a");
  assert.equal(graph.edges.find((edge) => edge.id === relations[0].id)?.target, "character-a");
});

test("normal Kuzushiji runtime rejects historical v1 while the global decoder keeps v1 compatible", () => {
  const legacy = v1Snapshot();
  const neutral = adaptScopeKnowledgeSnapshot(legacy);
  assert.equal(decodeProjectReadSnapshot(neutral).projectionVersion, "kuzushiji-v1");
  assert.deepEqual(decodeStoredProjectReadState("kuzushiji", legacy), {
    kind: "invalid-candidate",
    errorCode: "project-projection-mismatch",
  });
});

test("stale v2 remains renderable and an empty knowledge projection is not inferred from review data", () => {
  const stale = { ...v2Snapshot(), validUntil: "2000-01-01T00:00:00.000Z" };
  const staleState = decodeStoredProjectReadState("kuzushiji", stale, Date.parse("2030-01-01T00:30:00.000Z"));
  assert.equal(staleState.kind, "stale");
  assert.equal(isKuzushijiV2ProjectReadState(staleState), true);

  const emptyProjection = projection({
    lectures: [],
    characters: [],
    mistakes: [],
    sources: [],
    expressions: [],
    relations: [],
    completeness: completeness({
      dataSources: KUZUSHIJI_V2_SOURCE_IDENTIFIERS.map((sourceIdentifier) => ({ sourceIdentifier, itemCount: 0, paginationComplete: true as const })),
      relationProperties: [],
    }),
  });
  const emptyState = decodeStoredProjectReadState("kuzushiji", v2Snapshot(emptyProjection), Date.parse("2030-01-01T00:30:00.000Z"));
  assert.equal(emptyState.kind, "ready");
  assert.equal(emptyState.dataStatus, "authoritative-empty");
});

test("generation adoption keeps a cached v1 readable and prefers a newer v2 observation", () => {
  const old = v1Snapshot();
  const current = v2Snapshot();
  assert.equal(selectSnapshotForDisplay(current, old).source, "server");
  const serverV1 = { ...old, generation: 1 };
  assert.equal(selectSnapshotForDisplay(serverV1, current).source, "cache");
  assert.equal(selectSnapshotForDisplay(serverV1, current).snapshot.knowledgeProjectionVersion, "kuzushiji-v2");
});
