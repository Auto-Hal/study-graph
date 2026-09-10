import assert from "node:assert/strict";
import test from "node:test";
import { createScopeKnowledgeSnapshot, isScopeKnowledgeSnapshotHashValid } from "../review/offline/snapshot.ts";
import type { ScopeKnowledgeSnapshot } from "../review/offline/snapshot-content.ts";
import type { PhilosophyV1Projection, WesternArtHistoryV1Projection } from "./project-projections.ts";
import { projectReadSnapshotToGraph } from "./project-graph.ts";
import { decodeStoredProjectReadState, isRenderableProjectReadState } from "./read-runtime-core.ts";

const timestamps = {
  sourceReadStartedAt: "2026-09-10T00:00:00.000Z",
  sourceReadCompletedAt: "2026-09-10T00:00:01.000Z",
  publishedAt: "2026-09-10T00:00:02.000Z",
};

const completeness = { dataSources: [], relationProperties: [], unresolvedTargets: [] } as const;

function artProjection(): WesternArtHistoryV1Projection {
  return {
    lectures: [{
      id: "art-lecture-1", url: "https://example.test/art-lecture-1", label: "第1回 美術史",
      sequence: 1, phase: "", status: "", theme: "", reviewText: null,
    }],
    artists: [{
      id: "art-placeholder", url: "https://example.test/art-placeholder", label: "芸術家",
      lifespan: "", region: "", importance: "", technique: "", reviewText: null,
    }],
    artworks: [{
      id: "art-work-1", url: "https://example.test/art-work-1", label: "作品A",
      productionYear: "1500", genre: "絵画", country: "イタリア", importance: "A", subjects: ["宗教"], reviewText: "宗教",
    }],
    movements: [], terms: [], periods: [], culture: [], museums: [],
    relations: [{
      id: "art-relation-1", sourceEntityId: "art-lecture-1", targetEntityId: "art-work-1",
      kind: "lecture-artwork", label: "関連作品",
    }],
    completeness,
  };
}

function philosophyProjection(): PhilosophyV1Projection {
  return {
    lectures: [{
      id: "phil-lecture-1", url: "https://example.test/phil-lecture-1", label: "第1回 哲学",
      sequence: 1, status: "", question: "", reviewText: null,
    }],
    philosophers: [{
      id: "phil-person-1", url: "https://example.test/phil-person-1", label: "哲学者A",
      lifespan: "", schools: ["自然哲学"], regions: ["古代ギリシア"], memo: "", reviewText: null,
    }],
    terms: [], problems: [], works: [], culture: [], periods: [], thoughtNotes: [],
    relations: [{
      id: "phil-relation-1", sourceEntityId: "phil-lecture-1", targetEntityId: "phil-person-1",
      kind: "lecture-philosopher", label: "哲学者",
    }],
    completeness,
  };
}

function snapshot(projectId: "western-art-history" | "philosophy", projection: WesternArtHistoryV1Projection | PhilosophyV1Projection, validUntil = "2026-09-10T02:00:01.000Z"): ScopeKnowledgeSnapshot {
  return createScopeKnowledgeSnapshot({
    snapshotId: `${projectId}-snapshot-1`,
    projectId,
    generation: 1,
    ...timestamps,
    validUntil,
    scopePolicyVersion: "not-applicable-no-objective-v1",
    knowledgeProjectionVersion: projectId === "western-art-history" ? "western-art-history-v1" : "philosophy-v1",
    sourceEvidence: { sourceIdentifiers: [`notion:${projectId}`], paginationComplete: true, relationCompleteness: true },
    scopeDecisions: [],
    knowledgeProjection: projection as unknown as ScopeKnowledgeSnapshot["knowledgeProjection"],
  });
}

test("valid Art snapshot decodes and converts to one immutable graph observation", () => {
  const stored = snapshot("western-art-history", artProjection());
  const state = decodeStoredProjectReadState("western-art-history", stored, Date.parse("2026-09-10T01:00:00.000Z"));
  assert.equal(state.kind, "ready");
  assert.equal(state.dataStatus, "available");
  if (!isRenderableProjectReadState(state)) throw new Error("expected renderable Art state");
  const graph = projectReadSnapshotToGraph(state.data);
  assert.equal(graph.mode, "snapshot");
  assert.deepEqual(graph.nodes.map((node) => node.id), ["art-lecture-1", "art-work-1"]);
  assert.deepEqual(graph.edges, [{ id: "art-relation-1", source: "art-lecture-1", target: "art-work-1", kind: "lecture-artwork", label: "関連作品" }]);
  assert.equal(graph.nodes.find((node) => node.id === "art-work-1")?.href, "/projects/western-art-history/artworks/art-work-1");
  assert.equal(isScopeKnowledgeSnapshotHashValid(stored), true);
});

test("valid Philosophy snapshot decodes and preserves node/relation URLs and hrefs", () => {
  const stored = snapshot("philosophy", philosophyProjection());
  const state = decodeStoredProjectReadState("philosophy", stored, Date.parse("2026-09-10T01:00:00.000Z"));
  assert.equal(state.kind, "ready");
  if (!isRenderableProjectReadState(state)) throw new Error("expected renderable Philosophy state");
  const graph = projectReadSnapshotToGraph(state.data);
  assert.equal(graph.mode, "snapshot");
  assert.equal(graph.nodes.find((node) => node.id === "phil-person-1")?.notionUrl, "https://example.test/phil-person-1");
  assert.equal(graph.nodes.find((node) => node.id === "phil-person-1")?.href, "/projects/philosophy/philosophers/phil-person-1");
  assert.equal(graph.edges[0]?.kind, "lecture-philosopher");
});

test("stale verified snapshot remains renderable with its actual data", () => {
  const stored = snapshot("philosophy", philosophyProjection(), "2026-09-09T23:00:00.000Z");
  const state = decodeStoredProjectReadState("philosophy", stored, Date.parse("2026-09-10T01:00:00.000Z"));
  assert.equal(state.kind, "stale");
  assert.equal(state.dataStatus, "available");
  if (!isRenderableProjectReadState(state)) throw new Error("expected stale state to remain renderable");
  assert.equal(projectReadSnapshotToGraph(state.data).nodes.length, 2);
});

test("missing and unsupported reads are distinct from an authoritative empty projection", () => {
  const missing = decodeStoredProjectReadState("philosophy", null);
  assert.deepEqual(missing, { kind: "missing", reason: "not-yet-published" });

  const unsupported = decodeStoredProjectReadState("unknown", null);
  assert.deepEqual(unsupported, { kind: "unavailable", errorCode: "unsupported-project" });

  const emptyProjection: PhilosophyV1Projection = {
    lectures: [], philosophers: [], terms: [], problems: [], works: [], culture: [], periods: [], thoughtNotes: [], relations: [], completeness,
  };
  const empty = decodeStoredProjectReadState("philosophy", snapshot("philosophy", emptyProjection), Date.parse("2026-09-10T01:00:00.000Z"));
  assert.equal(empty.kind, "ready");
  assert.equal(empty.dataStatus, "authoritative-empty");
});
