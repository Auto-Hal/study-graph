import assert from "node:assert/strict";
import test from "node:test";
import type { GraphData } from "../graph/types.ts";
import type { ReviewCard } from "./types.ts";
import { evaluateReviewCardQuality } from "./quality.ts";

function graph(kind = "term", id = "term-1", reviewText = "定義文"): Pick<GraphData, "nodes"> {
  return {
    nodes: [{
      id,
      kind,
      label: "対象",
      meta: "管理情報",
      reviewText,
      href: null,
      notionUrl: "#",
    }],
  };
}

function textCard(overrides: { answer?: ReviewCard["answer"]; front?: string; prompt?: string; asset?: ReviewCard["asset"] } = {}): ReviewCard {
  return {
    id: "term-1",
    exerciseId: "term-1:test",
    projectId: "philosophy",
    kind: "knowledge",
    kindLabel: "用語",
    eyebrow: "CONCEPT",
    label: "対象",
    prompt: overrides.prompt ?? "説明を選んでください。",
    front: overrides.front ?? "対象",
    frontStyle: "title",
    reason: "test",
    answer: overrides.answer && overrides.answer.type === "text"
      ? overrides.answer
      : { type: "text", acceptedAnswers: ["正答"] },
    answerRows: [],
    sourceUrl: "#",
    ...(overrides.asset ? { asset: overrides.asset } : {}),
  };
}

test("quality rejects visible self-answer and missing visual asset", () => {
  const selfAnswer = evaluateReviewCardQuality(
    textCard({ front: "正答" }),
    graph(),
    new Set(["term-1"]),
  );
  assert.equal(selfAnswer.status, "reject");
  assert.equal(selfAnswer.reasonCodes.includes("answer-visible"), true);

  const visualWithoutAsset = evaluateReviewCardQuality(
    { ...textCard(), eyebrow: "VISUAL" },
    graph(),
    new Set(["term-1"]),
  );
  assert.equal(visualWithoutAsset.status, "reject");
  assert.equal(visualWithoutAsset.reasonCodes.includes("visual-asset-missing"), true);
});

test("quality rejects lecture answers, duplicate options, and out-of-scope options", () => {
  const lecture = evaluateReviewCardQuality(
    textCard(),
    graph("lecture"),
    new Set(["term-1"]),
  );
  assert.equal(lecture.status, "reject");
  assert.equal(lecture.reasonCodes.includes("admin-node-answer"), true);

  const duplicateOptions: ReviewCard = {
    ...textCard(),
    answer: {
      type: "single-choice",
      options: [
        { id: "term-1", label: "対象" },
        { id: "term-2", label: "別解" },
        { id: "term-3", label: "別解" },
        { id: "term-4", label: "別の候補" },
      ],
      correctOptionId: "term-1",
    },
  };
  const duplicate = evaluateReviewCardQuality(
    duplicateOptions,
    {
      nodes: [
        ...graph().nodes,
        ...["term-2", "term-3", "term-4"].map((id) => ({
          id,
          kind: "term",
          label: id,
          meta: "",
          reviewText: "説明" + id,
          href: null,
          notionUrl: "#",
        })),
      ],
    },
    new Set(["term-1", "term-2", "term-3", "term-4"]),
  );
  assert.equal(duplicate.status, "reject");
  assert.equal(duplicate.reasonCodes.includes("duplicate-option-label"), true);

  const outOfScope: ReviewCard = {
    ...duplicateOptions,
    answer: {
      type: "single-choice",
      options: [
        { id: "term-1", label: "対象" },
        { id: "term-2", label: "別1" },
        { id: "term-3", label: "別2" },
        { id: "term-4", label: "別3" },
      ],
      correctOptionId: "term-1",
    },
  };
  const rejectedScope = evaluateReviewCardQuality(
    outOfScope,
    { nodes: [...graph().nodes] },
    new Set(["term-1"]),
  );
  assert.equal(rejectedScope.status, "reject");
  assert.equal(rejectedScope.reasonCodes.includes("out-of-scope-option"), true);
});
