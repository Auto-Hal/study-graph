import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import type { KuzushijiSnapshotSource } from "../../notion/kuzushiji-snapshot-source.ts";
import type { KuzushijiV2SnapshotSource } from "../../notion/kuzushiji-v2-snapshot-source.ts";
import { createKuzushijiScopeKnowledgeSnapshot, createKuzushijiV2ScopeKnowledgeSnapshot } from "./model.ts";
import { KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from "../../projects/project-projections.ts";
import { dashboardFromScopeKnowledgeSnapshot, selectSnapshotForDisplay } from "./dashboard.ts";
import { createScopeKnowledgeSnapshot } from "../offline/snapshot.ts";

const lecture: Lecture = {
  id: "lecture-1", url: "#", title: "講義", sequence: 1, theme: "テーマ", status: "完了",
  completedAt: "2030-01-01", reviewAccuracy: null, newCharactersCount: null,
};
const character: Character = {
  id: "character-1", url: "#", glyph: "あ", reading: "あ", mother: "安", category: "変体仮名",
  mastery: "学習中", importance: "A", errorCount: 1, lastReviewedAt: null,
};
const mistake: Mistake = {
  id: "mistake-1", url: "#", title: "誤読", answer: "お", correctAnswer: "あ", cause: "字形",
  retry: true, resolved: false, errorDate: null,
};

function source(overrides: Partial<KuzushijiSnapshotSource> = {}): KuzushijiSnapshotSource {
  return {
    lectures: [lecture], characters: [character], mistakes: [mistake], paginationComplete: true,
    relationCompleteness: true, sourceIdentifiers: ["notion:lectures", "notion:characters", "notion:mistakes"], ...overrides,
  };
}

function snapshot() {
  return createKuzushijiScopeKnowledgeSnapshot({
    source: source(), snapshotId: "11111111-1111-4111-8111-111111111111", generation: 1,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z", sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
    publishedAt: "2030-01-01T00:01:01.000Z",
  });
}

function v2Snapshot() {
  const source: KuzushijiV2SnapshotSource = {
    sourceIdentifiers: [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS],
    paginationComplete: true,
    relationCompleteness: true,
    projection: {
      lectures: [lecture],
      characters: [character],
      mistakes: [mistake],
      sources: [{
        id: "source-1", url: "https://example.test/source-1", title: "資料", usage: "教材",
        materialType: "画像", difficulty: "入門", period: "江戸", era: "1700", institution: "所蔵館",
        referenceUrl: "https://example.test/reference", readingAccuracy: null, weakPoint: "",
      }],
      expressions: [{
        id: "expression-1", url: "https://example.test/expression-1", expression: "候", reading: "そうろう",
        category: "候文", meaning: "意味", example: "用例", notes: "", mastery: "学習中", importance: "A",
      }],
      reviewQueue: [],
      relations: [],
      completeness: {
        dataSources: KUZUSHIJI_V2_SOURCE_IDENTIFIERS.map((sourceIdentifier) => ({
          sourceIdentifier,
          itemCount: 1,
          paginationComplete: true as const,
        })),
        relationProperties: [
          ["lecture-1", "lecture", "重要・弱点字", "lecture-character"],
          ["lecture-1", "lecture", "誤読記録", "lecture-mistake"],
          ["lecture-1", "lecture", "使用資料", "lecture-source"],
          ["lecture-1", "lecture", "頻出表現", "lecture-expression"],
          ["mistake-1", "mistake", "関連文字", "mistake-character"],
          ["mistake-1", "mistake", "関連資料", "mistake-source"],
        ].map(([sourceEntityId, ownerKind, propertyName, relationKind]) => ({
          sourceEntityId, ownerKind, propertyName, relationKind, itemCount: 0, paginationComplete: true as const,
        })),
        unresolvedTargets: [],
      },
    },
  };
  return createKuzushijiV2ScopeKnowledgeSnapshot({
    source,
    snapshotId: "22222222-2222-4222-8222-222222222222",
    generation: 2,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:01:00.000Z",
    publishedAt: "2030-01-01T00:01:01.000Z",
  });
}

test("snapshot projection maps to dashboard without live Notion access", () => {
  const dashboard = dashboardFromScopeKnowledgeSnapshot(snapshot());
  assert.equal(dashboard.mode, "snapshot");
  assert.equal(dashboard.sourceState, "ready");
  assert.deepEqual(dashboard.lectures.map((item) => item.id), ["lecture-1"]);
  assert.deepEqual(dashboard.characters.map((item) => item.glyph), ["あ"]);
  assert.deepEqual(dashboard.mistakes.map((item) => item.id), ["mistake-1"]);
  assert.deepEqual(dashboard.reviewQueue.map((item) => item.id), ["mistake-1", "character-1"]);
});

test("malformed dashboard projection fails closed", () => {
  const value = snapshot();
  const malformed = {
    ...value,
    knowledgeProjection: { ...(value.knowledgeProjection as Record<string, unknown>), characters: [{ id: "only-id" }] },
  };
  assert.throws(() => dashboardFromScopeKnowledgeSnapshot(malformed), /characters/);
});

test("both v1 and v2 projections map to the existing Home dashboard", () => {
  assert.equal(dashboardFromScopeKnowledgeSnapshot(v2Snapshot()).mode, "snapshot");
  assert.deepEqual(dashboardFromScopeKnowledgeSnapshot(v2Snapshot()).reviewQueue.map((item) => item.id), ["mistake-1", "character-1"]);

  const value = snapshot();
  const { contentHash: _contentHash, ...input } = value;
  const supported = createScopeKnowledgeSnapshot(input);
  assert.equal(dashboardFromScopeKnowledgeSnapshot(supported).mode, "snapshot");

  const v2 = createScopeKnowledgeSnapshot({ ...input, knowledgeProjectionVersion: "kuzushiji-v2" });
  assert.throws(() => dashboardFromScopeKnowledgeSnapshot(v2), /projection is invalid|projection\.sources/);
});

test("a different project is rejected by the dashboard adapter", () => {
  const value = snapshot();
  const { contentHash: _contentHash, ...input } = value;
  const otherProject = createScopeKnowledgeSnapshot({ ...input, projectId: "philosophy" });
  assert.throws(() => dashboardFromScopeKnowledgeSnapshot(otherProject), /projection is invalid/);
});

test("display provenance uses the server source unless local generation is newer", () => {
  const server = snapshot();
  const { contentHash: _contentHash, ...input } = server;
  const sameGenerationClone = createScopeKnowledgeSnapshot({ ...input });
  const same = selectSnapshotForDisplay(server, sameGenerationClone);
  assert.equal(same.source, "server");
  assert.equal(same.snapshot.snapshotId, server.snapshotId);

  const newer = createScopeKnowledgeSnapshot({ ...input, snapshotId: "22222222-2222-4222-8222-222222222222", generation: 2 });
  const newerSelection = selectSnapshotForDisplay(server, newer);
  assert.equal(newerSelection.source, "cache");
  assert.equal(newerSelection.snapshot.generation, 2);
});

test("an expired validUntil remains displayable because freshness is not authority", () => {
  const value = snapshot();
  const stale = { ...value, validUntil: "2000-01-01T00:00:00.000Z" };
  const dashboard = dashboardFromScopeKnowledgeSnapshot(stale);
  assert.equal(dashboard.validUntil, "2000-01-01T00:00:00.000Z");
  assert.equal(dashboard.characters.length, 1);
});
