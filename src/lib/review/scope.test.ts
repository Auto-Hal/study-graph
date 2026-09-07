import assert from "node:assert/strict";
import test from "node:test";
import { createKuzushijiPilotReviewCard } from "./exercises/kuzushiji-adapter.ts";
import { kuzushijiPilotRecord } from "./exercises/kuzushiji-pilot.ts";
import {
  buildGraphScopeSnapshot,
  buildKuzushijiScopeSnapshot,
  eligibleNodeIds,
  evaluateKuzushijiCharacterScope,
} from "./scope.ts";
import type { GraphData, GraphScopeEvidence } from "../graph/types.ts";
import type { Character, KuzushijiDashboard } from "../notion/kuzushiji.ts";

const evaluatedAt = new Date("2026-09-07T00:00:00+09:00");

function character(id: string, mastery: string, reading = "あ"): Character {
  return {
    id,
    url: "#",
    glyph: reading,
    reading,
    mother: "安",
    category: "変体仮名",
    mastery,
    importance: "通常",
    errorCount: 0,
    lastReviewedAt: null,
  };
}

function kuzushijiData(characters: Character[], sourceState: KuzushijiDashboard["sourceState"] = "ready") {
  return { sourceState, characters } as Pick<KuzushijiDashboard, "sourceState" | "characters">;
}

function graph(
  sourceState: GraphScopeEvidence["sourceState"],
  anchors: GraphScopeEvidence["anchors"],
  nodes = anchors.flatMap((anchor) => anchor.directRelations.map((relation) => ({
    id: relation.nodeId,
    kind: relation.kind.replace(/^lecture-/, ""),
    label: relation.nodeId,
    meta: "",
    href: null,
    notionUrl: "#",
  }))),
): Pick<GraphData, "scope" | "nodes"> {
  return { scope: { sourceState, anchors }, nodes };
}

test("Kuzushiji mastery maps learning-ready states without implying mastery", () => {
  assert.equal(evaluateKuzushijiCharacterScope(character("unlearned", "未学習")).status, "ineligible");
  assert.equal(evaluateKuzushijiCharacterScope(character("learning", "学習中")).status, "eligible");
  assert.equal(evaluateKuzushijiCharacterScope(character("readable", "読める")).status, "eligible");
  assert.equal(evaluateKuzushijiCharacterScope(character("instant", "即読")).status, "eligible");
  assert.equal(evaluateKuzushijiCharacterScope(character("blank", "")).status, "unknown");
  assert.equal(evaluateKuzushijiCharacterScope(character("future", "未対応")).status, "unknown");
});

test("Kuzushiji source failure fails closed", () => {
  const snapshot = buildKuzushijiScopeSnapshot(
    kuzushijiData([character("learning", "学習中")], "unavailable"),
    evaluatedAt,
  );
  assert.equal(snapshot.decisions.learning.status, "unknown");
  assert.equal(eligibleNodeIds(snapshot).size, 0);
});

test("current learning character can produce the Phase 4A pilot", () => {
  const candidate = character("notion-a", "学習中");
  const snapshot = buildKuzushijiScopeSnapshot(kuzushijiData([candidate]), evaluatedAt);
  assert.equal(snapshot.decisions[candidate.id].status, "eligible");
  const card = createKuzushijiPilotReviewCard(
    { id: "kuzushiji" },
    candidate,
    { id: candidate.id, kind: "character", label: "あ", reason: "学習中" },
  );
  assert.ok(card);
  assert.equal(card.answerRows.find((row) => row.label === "字母")?.value, kuzushijiPilotRecord.metadata.motherCharacter.value);
  assert.equal(kuzushijiPilotRecord.metadata.motherCharacter.value, "阿");
});

test("completed philosophy lecture directly unlocks related knowledge only", () => {
  const snapshot = buildGraphScopeSnapshot(
    "philosophy",
    graph("ready", [
      {
        id: "lecture-1",
        completion: "completed",
        date: null,
        directRelations: [{ nodeId: "term-1", kind: "lecture-term" }],
      },
      {
        id: "lecture-2",
        completion: "incomplete",
        date: null,
        directRelations: [{ nodeId: "term-2", kind: "lecture-term" }],
      },
    ]),
    evaluatedAt,
  );
  assert.equal(snapshot.decisions["term-1"].status, "eligible");
  assert.equal(snapshot.decisions["term-2"].status, "ineligible");
});

test("graph scope is direct-one-hop and excludes future, missing, and invalid art dates", () => {
  const snapshot = buildGraphScopeSnapshot(
    "western-art-history",
    graph("ready", [
      {
        id: "lecture-past",
        completion: "unknown",
        date: "2026-09-06",
        directRelations: [{ nodeId: "art-past", kind: "lecture-artwork" }],
      },
      {
        id: "lecture-today",
        completion: "unknown",
        date: "2026-09-07",
        directRelations: [{ nodeId: "art-today", kind: "lecture-artwork" }],
      },
      {
        id: "lecture-future",
        completion: "unknown",
        date: "2026-09-08",
        directRelations: [{ nodeId: "art-future", kind: "lecture-artwork" }],
      },
      {
        id: "lecture-missing",
        completion: "unknown",
        date: null,
        directRelations: [{ nodeId: "art-missing", kind: "lecture-artwork" }],
      },
      {
        id: "lecture-invalid",
        completion: "unknown",
        date: "2026-02-30",
        directRelations: [{ nodeId: "art-invalid", kind: "lecture-artwork" }],
      },
      {
        id: "lecture-hop",
        completion: "unknown",
        date: "2026-09-06",
        directRelations: [{ nodeId: "art-hop-1", kind: "lecture-artwork" }],
      },
    ], [
      ...["art-past", "art-today", "art-future", "art-missing", "art-invalid", "art-hop-1", "movement-hop-2"].map((id) => ({
        id,
        kind: id.startsWith("movement") ? "movement" : "artwork",
        label: id,
        meta: "",
        href: null,
        notionUrl: "#",
      })),
    ]),
    evaluatedAt,
  );
  assert.equal(snapshot.decisions["art-past"].status, "eligible");
  assert.equal(snapshot.decisions["art-today"].status, "eligible");
  assert.equal(snapshot.decisions["art-future"].status, "ineligible");
  assert.equal(snapshot.decisions["art-missing"].status, "unknown");
  assert.equal(snapshot.decisions["art-invalid"].status, "unknown");
  assert.equal(snapshot.decisions["movement-hop-2"].status, "unknown");
});

test("demo or unavailable graph data cannot unlock scope", () => {
  const snapshot = buildGraphScopeSnapshot(
    "western-art-history",
    graph("demo", [{
      id: "lecture-demo",
      completion: "unknown",
      date: "2026-09-06",
      directRelations: [{ nodeId: "art-demo", kind: "lecture-artwork" }],
    }]),
    evaluatedAt,
  );
  assert.equal(snapshot.decisions["art-demo"].status, "unknown");
  assert.equal(eligibleNodeIds(snapshot).size, 0);
});
