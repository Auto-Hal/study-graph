import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidExerciseObjectiveBinding,
  assertValidObjectiveDefinition,
  assertValidObjectiveSrsTarget,
  assertValidSrsEpoch,
  canonicalizeObjectiveDefinition,
  hashObjectiveDefinition,
  validateExerciseObjectiveBindings,
  type ObjectiveDefinition,
} from "./objectives.ts";
import {
  KUZUSHIJI_PILOT_OBJECTIVE_ID,
  KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  KUZUSHIJI_PILOT_SRS_EPOCH,
  kuzushijiPilotObjectiveBinding,
  kuzushijiPilotObjectiveBindings,
  kuzushijiPilotObjectiveDefinition,
  kuzushijiPilotObjectiveSrsTarget,
  kuzushijiPilotRevisionContentHash,
} from "./exercises/kuzushiji-objective.ts";
import { createKuzushijiPilotReviewCard } from "./exercises/kuzushiji-adapter.ts";
import {
  hashContentReleaseManifest,
  hashExerciseRevision,
} from "./exercises/revision.ts";
import {
  kuzushijiPilotContentRelease,
  kuzushijiPilotContentReleaseManifest,
  kuzushijiPilotRevision,
} from "./exercises/kuzushiji-revision.ts";

function objectiveCopy(): ObjectiveDefinition {
  return JSON.parse(JSON.stringify(kuzushijiPilotObjectiveDefinition)) as ObjectiveDefinition;
}

test("pilot Objective identity, version, epoch, and recall mode remain exact", () => {
  assert.equal(kuzushijiPilotObjectiveDefinition.objectiveId, KUZUSHIJI_PILOT_OBJECTIVE_ID);
  assert.equal(kuzushijiPilotObjectiveDefinition.objectiveVersion, KUZUSHIJI_PILOT_OBJECTIVE_VERSION);
  assert.equal(kuzushijiPilotObjectiveSrsTarget.projectId, "kuzushiji");
  assert.equal(kuzushijiPilotObjectiveSrsTarget.objectiveId, KUZUSHIJI_PILOT_OBJECTIVE_ID);
  assert.equal(kuzushijiPilotObjectiveSrsTarget.srsEpoch, KUZUSHIJI_PILOT_SRS_EPOCH);
  assert.equal(kuzushijiPilotObjectiveSrsTarget.srsEpoch, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(kuzushijiPilotObjectiveDefinition, "srsEpoch"), false);
  assert.doesNotThrow(() => assertValidObjectiveSrsTarget(kuzushijiPilotObjectiveSrsTarget));
  assert.equal(kuzushijiPilotObjectiveDefinition.responseMode, "recall");
  assert.equal(kuzushijiPilotObjectiveDefinition.target, "日本永代蔵 U+3042 pilot source image の当該字形");
  assert.equal(kuzushijiPilotObjectiveDefinition.action, "提示された単字字形を読み、読みを答える");
  assert.equal(kuzushijiPilotObjectiveDefinition.conditions, "単字画像提示。選択肢なし。文脈なし。ヒントなし。");
  assert.equal(kuzushijiPilotObjectiveDefinition.successCriterion, "正規化後の回答が「あ」と一致すること。");
  for (const field of [
    kuzushijiPilotObjectiveDefinition.target,
    kuzushijiPilotObjectiveDefinition.action,
    kuzushijiPilotObjectiveDefinition.conditions,
    kuzushijiPilotObjectiveDefinition.successCriterion,
  ]) {
    assert.doesNotMatch(field, /あ全般|字母|阿|文中|選択式/);
  }
});

test("pilot revision has one explicit SRS binding to its existing content hash", () => {
  assert.equal(kuzushijiPilotObjectiveBindings.length, 1);
  assert.equal(kuzushijiPilotObjectiveBinding.revisionContentHash, kuzushijiPilotRevisionContentHash);
  assert.equal(kuzushijiPilotObjectiveBinding.revisionContentHash, kuzushijiPilotRevision.contentHash);
  assert.equal(Object.prototype.hasOwnProperty.call(kuzushijiPilotObjectiveBinding, "revisionId"), false);
  assert.equal(kuzushijiPilotObjectiveBinding.objectiveId, KUZUSHIJI_PILOT_OBJECTIVE_ID);
  assert.equal(kuzushijiPilotObjectiveBinding.objectiveVersion, 1);
  assert.equal(kuzushijiPilotObjectiveBinding.evidenceUse, "srs");
  assert.deepEqual(validateExerciseObjectiveBindings(kuzushijiPilotObjectiveBindings), []);
});

test("Objective and binding validators reject invalid values", () => {
  const invalidVersion = objectiveCopy();
  invalidVersion.objectiveVersion = 0;
  assert.throws(() => assertValidObjectiveDefinition(invalidVersion), /objectiveVersion/);

  assert.throws(() => assertValidSrsEpoch(0), /srsEpoch/);
  assert.throws(() => assertValidSrsEpoch(1.5), /srsEpoch/);
  assert.throws(
    () => assertValidObjectiveSrsTarget({ ...kuzushijiPilotObjectiveSrsTarget, srsEpoch: 0 }),
    /srsEpoch/,
  );

  const invalidMode = objectiveCopy();
  invalidMode.responseMode = "choice" as ObjectiveDefinition["responseMode"];
  assert.throws(() => assertValidObjectiveDefinition(invalidMode), /responseMode/);

  const invalidEvidence = { ...kuzushijiPilotObjectiveBinding, evidenceUse: "generated" };
  assert.throws(() => assertValidExerciseObjectiveBinding(invalidEvidence), /evidenceUse/);

  const selfSuperseding = objectiveCopy();
  selfSuperseding.supersedes = {
    objectiveId: selfSuperseding.objectiveId,
    objectiveVersion: selfSuperseding.objectiveVersion,
  };
  assert.throws(() => assertValidObjectiveDefinition(selfSuperseding), /supersede itself/);

  const duplicateBindings = [kuzushijiPilotObjectiveBinding, { ...kuzushijiPilotObjectiveBinding }];
  assert.match(validateExerciseObjectiveBindings(duplicateBindings).join(";"), /multiple Objective bindings/);
});

test("Objective canonicalization and hash are deterministic and order independent", () => {
  const first = objectiveCopy();
  const reordered: ObjectiveDefinition = {
    successCriterion: first.successCriterion,
    conditions: first.conditions,
    responseMode: first.responseMode,
    action: first.action,
    target: first.target,
    title: first.title,
    objectiveVersion: first.objectiveVersion,
    objectiveId: first.objectiveId,
    projectId: first.projectId,
  };
  assert.equal(canonicalizeObjectiveDefinition(first), canonicalizeObjectiveDefinition(reordered));
  assert.equal(hashObjectiveDefinition(first), hashObjectiveDefinition(reordered));
  assert.equal(hashObjectiveDefinition(first), hashObjectiveDefinition(objectiveCopy()));
});

test("SRS epoch is separate runtime metadata and never enters the Objective hash", () => {
  const definition = objectiveCopy();
  const epochOne = { ...definition, srsEpoch: 1 } as ObjectiveDefinition;
  const epochTwo = { ...definition, srsEpoch: 2 } as ObjectiveDefinition;
  assert.equal(hashObjectiveDefinition(epochOne), hashObjectiveDefinition(epochTwo));
  assert.equal(canonicalizeObjectiveDefinition(epochOne), canonicalizeObjectiveDefinition(epochTwo));
  assert.doesNotMatch(canonicalizeObjectiveDefinition(epochOne), /srsEpoch/);
});

test("Objective semantic changes alter the hash", () => {
  const baseHash = hashObjectiveDefinition(kuzushijiPilotObjectiveDefinition);
  for (const field of ["title", "target", "action", "conditions", "successCriterion"] as const) {
    const changed = objectiveCopy();
    changed[field] += "（変更）";
    assert.notEqual(hashObjectiveDefinition(changed), baseHash, `${field} must affect the hash`);
  }

  const modeChanged = objectiveCopy();
  modeChanged.responseMode = "production";
  assert.notEqual(hashObjectiveDefinition(modeChanged), baseHash);

  const versionChanged = objectiveCopy();
  versionChanged.objectiveVersion = 2;
  assert.notEqual(hashObjectiveDefinition(versionChanged), baseHash);

});

test("Phase 4C revision and release hashes remain unchanged", () => {
  assert.equal(kuzushijiPilotRevision.contentHash, "675e22c5ea7f3288dceb4b0c89a6a10d9624b9dd1de59c835a46e3eb07799594");
  assert.equal(kuzushijiPilotContentRelease.manifestHash, "09eb84df83abede6be3a9164105bd8cdf7c48775fdb6c13bca50d4b71df71c60");
  assert.equal(hashExerciseRevision(kuzushijiPilotRevision), kuzushijiPilotRevision.contentHash);
  assert.equal(hashContentReleaseManifest(kuzushijiPilotContentReleaseManifest), kuzushijiPilotContentRelease.manifestHash);
});

test("Objective model addition leaves the existing Phase 4A ReviewCard contract intact", () => {
  const card = createKuzushijiPilotReviewCard(
    { id: "character-objective-test" },
    {
      id: "character-objective-test",
      url: "#",
      glyph: "あ",
      reading: "あ",
      mother: "Notion側の値",
      category: "ひらがな",
      mastery: "学習中",
      importance: "通常",
      errorCount: 0,
      lastReviewedAt: null,
    },
    { id: "character-objective-test", kind: "character", label: "あ", reason: "objective test" },
  );
  assert.ok(card);
  assert.equal(card.exerciseId, "character-objective-test:visual-reading:eitaigura-u3042-00032-1:v1");
  assert.equal(card.answer.type, "text");
  assert.deepEqual(card.answer.acceptedAnswers, ["あ"]);
  assert.equal(card.answerRows.find((row) => row.label === "字母")?.value, "阿");
});
