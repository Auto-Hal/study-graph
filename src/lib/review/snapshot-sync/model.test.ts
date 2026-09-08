import assert from "node:assert/strict";
import test from "node:test";
import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import type { KuzushijiSnapshotSource } from "../../notion/kuzushiji-snapshot-source.ts";
import { isScopeKnowledgeSnapshotHashValid } from "../offline/snapshot.ts";
import {
  createKuzushijiKnowledgeProjection,
  createKuzushijiScopeKnowledgeSnapshot,
} from "./model.ts";

const lecture = (id: string, sequence: number): Lecture => ({
  id,
  url: `https://notion.example/${id}`,
  title: `講義${sequence}`,
  sequence,
  theme: "テーマ",
  status: "完了",
  completedAt: "2030-01-01",
  reviewAccuracy: null,
  newCharactersCount: null,
});

const character = (id: string, mastery: string, errorCount = 1): Character => ({
  id,
  url: `https://notion.example/${id}`,
  glyph: id,
  reading: id,
  mother: "安",
  category: "変体仮名",
  mastery,
  importance: "A",
  errorCount,
  lastReviewedAt: null,
});

const mistake = (id: string): Mistake => ({
  id,
  url: `https://notion.example/${id}`,
  title: "誤読",
  answer: "お",
  correctAnswer: "あ",
  cause: "字形",
  retry: true,
  resolved: false,
  errorDate: null,
});

function source(overrides: Partial<KuzushijiSnapshotSource> = {}): KuzushijiSnapshotSource {
  return {
    lectures: [lecture("lecture-2", 2), lecture("lecture-1", 1)],
    characters: [character("character-b", "学習中", 0), character("character-a", "未学習", 2)],
    mistakes: [mistake("mistake-2"), mistake("mistake-1")],
    paginationComplete: true,
    relationCompleteness: true,
    sourceIdentifiers: ["notion:characters", "notion:lectures", "notion:mistakes"],
    ...overrides,
  };
}

function build(input: Partial<Parameters<typeof createKuzushijiScopeKnowledgeSnapshot>[0]> = {}) {
  return createKuzushijiScopeKnowledgeSnapshot({
    source: source(),
    snapshotId: "11111111-1111-4111-8111-111111111111",
    generation: 4,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:10:00.000Z",
    publishedAt: "2030-01-01T00:10:01.000Z",
    ...input,
  });
}

test("strict source becomes a valid Phase 4E snapshot with deterministic projection", () => {
  const snapshot = build();
  assert.equal(snapshot.projectId, "kuzushiji");
  assert.equal(snapshot.scopePolicyVersion, "phase4b-v1");
  assert.equal(snapshot.knowledgeProjectionVersion, "kuzushiji-v1");
  assert.equal(snapshot.generation, 4);
  assert.equal(snapshot.validUntil, "2030-01-01T02:10:00.000Z");
  assert.equal(snapshot.sourceEvidence.paginationComplete, true);
  assert.equal(snapshot.sourceEvidence.relationCompleteness, true);
  assert.equal(isScopeKnowledgeSnapshotHashValid(snapshot), true);

  const projection = snapshot.knowledgeProjection as Record<string, unknown>;
  assert.deepEqual(Object.keys(projection).sort(), ["characters", "lectures", "mistakes", "reviewQueue"]);
  assert.equal("mode" in projection, false);
  assert.equal("sourceState" in projection, false);
  assert.deepEqual((projection.lectures as Array<{ id: string }>).map((item) => item.id), ["lecture-1", "lecture-2"]);
  assert.deepEqual((projection.characters as Array<{ id: string }>).map((item) => item.id), ["character-a", "character-b"]);
  assert.deepEqual(snapshot.scopeDecisions.map((item) => [item.subjectId, item.status]), [
    ["character-a", "ineligible"],
    ["character-b", "eligible"],
  ]);
});

test("source retrieval order does not change snapshot hash", () => {
  const first = build();
  const second = build({
    source: source({
      lectures: [lecture("lecture-1", 1), lecture("lecture-2", 2)],
      characters: [character("character-a", "未学習", 2), character("character-b", "学習中", 0)],
      mistakes: [mistake("mistake-1"), mistake("mistake-2")],
      sourceIdentifiers: ["notion:mistakes", "notion:lectures", "notion:characters"],
    }),
  });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(JSON.stringify(first.knowledgeProjection), JSON.stringify(second.knowledgeProjection));
});

test("scope source completeness is required before a snapshot can be built", () => {
  assert.throws(() => build({ source: source({ paginationComplete: false }) }), /pagination/);
  assert.throws(() => build({ source: source({ relationCompleteness: false }) }), /relation/);
});

test("projection queue keeps the current business rule with deterministic tie breaks", () => {
  const projection = createKuzushijiKnowledgeProjection(source({
    characters: [character("character-z", "学習中", 1), character("character-a", "学習中", 1), character("character-done", "即読", 99)],
    mistakes: [mistake("mistake-z"), mistake("mistake-a")],
  })) as Record<string, unknown>;
  const queue = projection.reviewQueue as Array<{ id: string; kind: string }>;
  assert.deepEqual(queue.map((item) => item.id), ["mistake-a", "mistake-z", "character-a", "character-z"]);
  assert.equal(queue.some((item) => item.id === "character-done"), false);
});
