import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import type { KuzushijiSnapshotSource } from "../../notion/kuzushiji-snapshot-source.ts";
import { createKuzushijiScopeKnowledgeSnapshot } from "./model.ts";
import { dashboardFromScopeKnowledgeSnapshot } from "./dashboard.ts";

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

test("an expired validUntil remains displayable because freshness is not authority", () => {
  const value = snapshot();
  const stale = { ...value, validUntil: "2000-01-01T00:00:00.000Z" };
  const dashboard = dashboardFromScopeKnowledgeSnapshot(stale);
  assert.equal(dashboard.validUntil, "2000-01-01T00:00:00.000Z");
  assert.equal(dashboard.characters.length, 1);
});
