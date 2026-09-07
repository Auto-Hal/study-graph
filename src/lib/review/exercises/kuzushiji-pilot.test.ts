import assert from "node:assert/strict";
import test from "node:test";
import { createKuzushijiPilotReviewCard, legacyKuzushijiExerciseId } from "./kuzushiji-adapter.ts";
import { kuzushijiPilotAsset, kuzushijiPilotAssets, kuzushijiPilotExercise, kuzushijiPilotRecord } from "./kuzushiji-pilot.ts";
import { validateExerciseDefinition } from "./validation.ts";

const project = { id: "kuzushiji" as const };
const item = {
  id: "character-a",
  kind: "character" as const,
  label: "あ",
  reason: "初回Practice · まだ復習履歴なし",
};

function character(overrides: { id?: string; reading?: string; mother?: string; label?: string } = {}) {
  return {
    id: overrides.id ?? item.id,
    url: "#",
    glyph: overrides.label ?? "あ",
    reading: overrides.reading ?? "あ",
    mother: overrides.mother ?? "別のNotion値",
    category: "ひらがな",
    mastery: "未習得",
    importance: "通常",
    errorCount: 0,
    lastReviewedAt: null,
  };
}

test("pilot record produces the existing ReviewCard contract", () => {
  const card = createKuzushijiPilotReviewCard(project, character(), item);
  assert.ok(card);
  assert.equal(card.id, "character-a");
  assert.equal(card.exerciseId, legacyKuzushijiExerciseId("character-a"));
  assert.equal(card.exerciseId, "character-a:visual-reading:eitaigura-u3042-00032-1:v1");
  assert.equal(card.projectId, "kuzushiji");
  assert.equal(card.answer.type, "text");
  assert.deepEqual(card.answer.acceptedAnswers, ["あ"]);
  assert.equal(card.asset?.src, "/assets/kuzushiji/a-eitaigura-hires.png");
  assert.equal(card.answerRows.find((row) => row.label === "字母")?.value, "阿");
});

test("character identity changes only the legacy ReviewCard id", () => {
  const first = createKuzushijiPilotReviewCard(project, character({ id: "one" }), item);
  const second = createKuzushijiPilotReviewCard(project, character({ id: "two" }), { ...item, id: "two" });
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.exerciseId, "one:visual-reading:eitaigura-u3042-00032-1:v1");
  assert.equal(second.exerciseId, "two:visual-reading:eitaigura-u3042-00032-1:v1");
  assert.equal(kuzushijiPilotExercise.exerciseId, "kuzushiji.visual-reading.eitaigura-u3042-00032-1");
  assert.equal(kuzushijiPilotExercise.objectiveId, "kuzushiji.a.eitaigura-u3042-00032-1.read");
  assert.equal(kuzushijiPilotExercise.exerciseVersion, 1);
});

test("curated mother character is independent from Notion Character metadata", () => {
  const originalValue = kuzushijiPilotRecord.metadata.motherCharacter.value;
  kuzushijiPilotRecord.metadata.motherCharacter.value = "教材record側の値";
  try {
    const card = createKuzushijiPilotReviewCard(project, character({ mother: "Notion側の値" }), item);
    assert.ok(card);
    assert.equal(card.answerRows.find((row) => row.label === "字母")?.value, "教材record側の値");
    assert.equal(kuzushijiPilotRecord.metadata.motherCharacter.status, "legacy-approved");
    assert.equal(kuzushijiPilotRecord.metadata.motherCharacter.approvedFrom, "PR #27");
  } finally {
    kuzushijiPilotRecord.metadata.motherCharacter.value = originalValue;
  }
  assert.equal(kuzushijiPilotRecord.metadata.motherCharacter.value, "阿");
});

test("answer is not exposed in the front-facing visual fields", () => {
  const card = createKuzushijiPilotReviewCard(project, character(), item);
  assert.ok(card);
  assert.equal(card.prompt.includes("あ"), false);
  assert.equal(card.front.includes("あ"), false);
  assert.equal(card.asset?.alt.includes("あ"), false);
});

test("unsupported readings do not produce a pilot card", () => {
  assert.equal(
    createKuzushijiPilotReviewCard(project, character({ reading: "い" }), item),
    null,
  );
});

test("definition validation catches asset reference and version errors", () => {
  assert.deepEqual(validateExerciseDefinition(kuzushijiPilotExercise, kuzushijiPilotAssets), []);
  const mismatchedAssets = new Map([[kuzushijiPilotAsset.assetId, { ...kuzushijiPilotAsset, assetVersion: 2 }]]);
  const errors = validateExerciseDefinition(kuzushijiPilotExercise, mismatchedAssets);
  assert.equal(errors.some((error) => error.includes("asset version mismatch")), true);
  const invalidAssets = new Map([[kuzushijiPilotAsset.assetId, { ...kuzushijiPilotAsset, alt: "", width: 0 }]]);
  const invalidAssetErrors = validateExerciseDefinition(kuzushijiPilotExercise, invalidAssets);
  assert.equal(invalidAssetErrors.some((error) => error.includes("asset alt is required")), true);
  assert.equal(invalidAssetErrors.some((error) => error.includes("asset width is invalid")), true);
  const invalidId = { ...kuzushijiPilotExercise, exerciseId: kuzushijiPilotExercise.exerciseId + ":v1" };
  assert.equal(validateExerciseDefinition(invalidId, kuzushijiPilotAssets).includes("exerciseId must not contain a version suffix"), true);
});
