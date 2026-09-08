import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import type { KuzushijiSnapshotSource } from "../../notion/kuzushiji-snapshot-source.ts";
import { createKuzushijiScopeKnowledgeSnapshot } from "./model.ts";
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

test("only the supported Kuzushiji projection version is accepted", () => {
  const value = snapshot();
  const { contentHash: _contentHash, ...input } = value;
  const supported = createScopeKnowledgeSnapshot(input);
  assert.equal(dashboardFromScopeKnowledgeSnapshot(supported).mode, "snapshot");

  const v2 = createScopeKnowledgeSnapshot({ ...input, knowledgeProjectionVersion: "kuzushiji-v2" });
  assert.throws(() => dashboardFromScopeKnowledgeSnapshot(v2), /projection is invalid/);
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
