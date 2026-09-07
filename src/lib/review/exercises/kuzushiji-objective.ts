import {
  assertValidExerciseObjectiveBinding,
  assertValidObjectiveDefinitionRecord,
  freezeObjectiveDefinition,
  hashObjectiveDefinition,
  INITIAL_SRS_EPOCH,
  type ExerciseObjectiveBinding,
  type ObjectiveDefinitionRecord,
} from "../objectives.ts";
import { kuzushijiPilotRevision } from "./kuzushiji-revision.ts";

export const KUZUSHIJI_PILOT_OBJECTIVE_ID = "kuzushiji.a.eitaigura-u3042-00032-1.read";
export const KUZUSHIJI_PILOT_OBJECTIVE_VERSION = 1;
export const KUZUSHIJI_PILOT_SRS_EPOCH = INITIAL_SRS_EPOCH;

/**
 * The pilot is intentionally narrower than a general "read あ" objective:
 * one fixed Eitaigura source glyph, one-character presentation, and
 * hint-free short-answer recall. The mother-character annotation is not part
 * of this capability definition.
 */
export const kuzushijiPilotObjectiveDefinition: ObjectiveDefinitionRecord = freezeObjectiveDefinition({
  projectId: "kuzushiji",
  objectiveId: KUZUSHIJI_PILOT_OBJECTIVE_ID,
  objectiveVersion: KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  srsEpoch: KUZUSHIJI_PILOT_SRS_EPOCH,
  title: "日本永代蔵「あ」字形の単字読解",
  target: "日本永代蔵 U+3042 pilot source image の当該字形",
  action: "提示された単字字形を読み、読みを答える",
  responseMode: "recall",
  conditions: "単字画像提示。選択肢なし。文脈なし。ヒントなし。",
  successCriterion: "正規化後の回答が「あ」と一致すること。",
});

/** Short alias for callers that treat the record as the active pilot objective. */
export const kuzushijiPilotObjective = kuzushijiPilotObjectiveDefinition;

/**
 * Git has no database-generated revision UUID. Phase 4D-1 therefore binds to
 * the existing immutable revision contentHash; archive registration maps it
 * to the database revision_id later without inventing an identifier here.
 */
export const kuzushijiPilotRevisionId = kuzushijiPilotRevision.contentHash;

export const kuzushijiPilotObjectiveBinding: ExerciseObjectiveBinding = Object.freeze({
  revisionId: kuzushijiPilotRevisionId,
  objectiveId: kuzushijiPilotObjectiveDefinition.objectiveId,
  objectiveVersion: kuzushijiPilotObjectiveDefinition.objectiveVersion,
  evidenceUse: "srs",
});

/** Explicit binding collection used by future release/archive consumers. */
export const kuzushijiPilotObjectiveBindings: readonly ExerciseObjectiveBinding[] = Object.freeze([
  kuzushijiPilotObjectiveBinding,
]);

export const kuzushijiPilotObjectiveContentHash = hashObjectiveDefinition(kuzushijiPilotObjectiveDefinition);

assertValidObjectiveDefinitionRecord(kuzushijiPilotObjectiveDefinition);
assertValidExerciseObjectiveBinding(kuzushijiPilotObjectiveBinding);
