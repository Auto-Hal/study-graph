import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { getStudyProject } from "../projects/registry.ts";
import { PHILOSOPHY_ARCHE_TERM_ID, PHILOSOPHY_ARCHE_TERM_URL } from "./exercises/philosophy-anaximander.ts";
import { philosophyObjectiveScopeSubjectIds } from "./philosophy-objective-registry.ts";
import { loadGraphPractice } from "./registry.ts";
import type { ReviewCard } from "./types.ts";

const oldFlag = process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
const oldToken = process.env.STUDY_GRAPH_APP_TOKEN;
process.env.STUDY_GRAPH_APP_TOKEN = "";
after(() => {
  if (oldFlag === undefined) delete process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
  else process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = oldFlag;
  if (oldToken === undefined) delete process.env.STUDY_GRAPH_APP_TOKEN;
  else process.env.STUDY_GRAPH_APP_TOKEN = oldToken;
});

function graph(state: "ready" | "unavailable" = "ready"): GraphData & { mode: "notion" } {
  const ids = [...philosophyObjectiveScopeSubjectIds, "term-2", "term-3", "term-4", "term-5"];
  return {
    projectId: "philosophy", mode: "notion",
    nodes: ids.map((id, index) => ({ id, kind: "term", label: `用語 ${index + 1}`, reviewText: `説明 ${index + 1}`,
      meta: "", href: null, notionUrl: PHILOSOPHY_ARCHE_TERM_URL })),
    edges: [], scope: { sourceState: state, anchors: [{ id: "lecture-1", completion: "completed", date: null,
      directRelations: ids.map((nodeId) => ({ nodeId, kind: "term" })) }] },
  };
}

const objectiveCard: ReviewCard = {
  id: PHILOSOPHY_ARCHE_TERM_ID, exerciseId: "philosophy.anaximander.arche-recall", projectId: "philosophy",
  kind: "knowledge", kindLabel: "用語", eyebrow: "OBJECTIVE", label: "アナクシマンドロス",
  prompt: "アナクシマンドロスのアルケーは？", front: "アナクシマンドロス", frontStyle: "title",
  reason: "Objective 初回復習", answer: { type: "text", acceptedAnswers: ["アペイロン"] },
  answerRows: [{ label: "正解", value: "アペイロン" }], sourceUrl: PHILOSOPHY_ARCHE_TERM_URL,
  persistenceKind: "versioned-pilot", instanceId: "11111111-1111-4111-8111-111111111111",
};

const project = getStudyProject("philosophy")!;
const source = async () => graph();

test("flag OFF leaves target in the legacy candidate set and never issues Objective", async () => {
  delete process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
  const result = await loadGraphPractice(project, { loadGraph: source, issuePhilosophyCards: async () => { throw new Error("must not issue"); } });
  assert.ok(result.cards.some((card) => card.id === PHILOSOPHY_ARCHE_TERM_ID));
  assert.ok(result.cards.every((card) => card.persistenceKind !== "versioned-pilot"));
});

test("flag ON excludes legacy target, prepends one Objective card, and respects sessionSize", async () => {
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  const smallProject = { ...project, review: { ...project.review, sessionSize: 3 } };
  let issues = 0;
  const result = await loadGraphPractice(smallProject, { loadGraph: source, issuePhilosophyCards: async () => { issues++; return [objectiveCard]; } });
  assert.equal(issues, 1);
  assert.equal(result.cards.length, 3);
  assert.equal(result.cards[0].persistenceKind, "versioned-pilot");
  assert.equal(result.cards.filter((card) => card.id === PHILOSOPHY_ARCHE_TERM_ID).length, 1);
  assert.ok(result.cards.slice(1).every((card) => !philosophyObjectiveScopeSubjectIds.includes(card.id)));
  assert.ok(result.cards.slice(1).every((card) => card.persistenceKind !== "versioned-pilot"));
});

test("three Objective cards precede legacy cards in trusted order and consume the session cap", async () => {
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  const smallProject = { ...project, review: { ...project.review, sessionSize: 4 } };
  const objectiveCards = philosophyObjectiveScopeSubjectIds.map((id) => ({ ...objectiveCard, id }));
  const result = await loadGraphPractice(smallProject, { loadGraph: source,
    issuePhilosophyCards: async () => objectiveCards });
  assert.deepEqual(result.cards.slice(0, 3).map((card) => card.id), philosophyObjectiveScopeSubjectIds);
  assert.equal(result.cards.length, 4);
  assert.ok(!philosophyObjectiveScopeSubjectIds.includes(result.cards[3].id));
});

test("not-due or issuer failure never falls back to legacy for the selected term", async () => {
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    for (const error of [new Error("issuer failed")]) {
      const result = await loadGraphPractice(project, { loadGraph: source, issuePhilosophyCards: async () => { throw error; } });
      assert.ok(result.cards.every((card) => !philosophyObjectiveScopeSubjectIds.includes(card.id)));
      assert.ok(result.cards.length > 0);
    }
  } finally { console.warn = originalWarn; }
});

test("unavailable source never issues a Philosophy Objective", async () => {
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  const result = await loadGraphPractice(project, { loadGraph: async () => graph("unavailable"),
    issuePhilosophyCards: async () => { throw new Error("must not issue"); } });
  assert.equal(result.cards.length, 0);
});
