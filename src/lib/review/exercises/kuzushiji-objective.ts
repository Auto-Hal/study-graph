import {
  assertValidExerciseObjectiveBinding,
  assertValidObjectiveSrsTarget,
  freezeObjectiveDefinition,
  hashObjectiveDefinition,
  INITIAL_SRS_EPOCH,
  type ExerciseObjectiveBinding,
  type ObjectiveDefinition,
  type ObjectiveSrsTarget,
} from "../objectives.ts";
import { kuzushijiPilotRevision, kuzushijiPilotRevisionV2 } from "./kuzushiji-revision.ts";

export const KUZUSHIJI_PILOT_OBJECTIVE_ID = "kuzushiji.a.eitaigura-u3042-00032-1.read";
export const KUZUSHIJI_PILOT_OBJECTIVE_VERSION = 1;
export const KUZUSHIJI_PILOT_SRS_EPOCH = INITIAL_SRS_EPOCH;

/**
 * The pilot is intentionally narrower than a general "read あ" objective:
 * one fixed Eitaigura source glyph, one-character presentation, and
 * hint-free short-answer recall. The mother-character annotation is not part
 * of this capability definition.
 */
export const kuzushijiPilotObjectiveDefinition: ObjectiveDefinition = freezeObjectiveDefinition({
  projectId: "kuzushiji",
  objectiveId: KUZUSHIJI_PILOT_OBJECTIVE_ID,
  objectiveVersion: KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  title: "日本永代蔵「あ」字形の単字読解",
  target: "日本永代蔵 U+3042 pilot source image の当該字形",
  action: "提示された単字字形を読み、読みを答える",
  responseMode: "recall",
  conditions: "単字画像提示。選択肢なし。文脈なし。ヒントなし。",
  successCriterion: "正規化後の回答が「あ」と一致すること。",
});

/** Short alias for callers that treat the record as the active pilot objective. */
export const kuzushijiPilotObjective = kuzushijiPilotObjectiveDefinition;

/** Runtime-neutral SRS generation metadata; it is not part of the Objective hash. */
export const kuzushijiPilotObjectiveSrsTarget: ObjectiveSrsTarget = Object.freeze({
  projectId: kuzushijiPilotObjectiveDefinition.projectId,
  objectiveId: kuzushijiPilotObjectiveDefinition.objectiveId,
  srsEpoch: KUZUSHIJI_PILOT_SRS_EPOCH,
});

assertValidObjectiveSrsTarget(kuzushijiPilotObjectiveSrsTarget);

/**
 * Git has no database-generated revision UUID. Phase 4D-1 therefore binds to
 * the existing immutable revision contentHash; archive registration maps it
 * to the database revision_id later without inventing an identifier here.
 */
export const kuzushijiPilotRevisionContentHash = kuzushijiPilotRevision.contentHash;

export const kuzushijiPilotObjectiveBinding: ExerciseObjectiveBinding = Object.freeze({
  revisionContentHash: kuzushijiPilotRevisionContentHash,
  objectiveId: kuzushijiPilotObjectiveDefinition.objectiveId,
  objectiveVersion: kuzushijiPilotObjectiveDefinition.objectiveVersion,
  evidenceUse: "srs",
});

/** Explicit binding collection used by future release/archive consumers. */
export const kuzushijiPilotObjectiveBindings: readonly ExerciseObjectiveBinding[] = Object.freeze([
  kuzushijiPilotObjectiveBinding,
]);

/** The v2 archive resolves this Git content hash to its database revision UUID. */
export const kuzushijiPilotV2ObjectiveBinding: ExerciseObjectiveBinding = Object.freeze({
  revisionContentHash: kuzushijiPilotRevisionV2.contentHash,
  objectiveId: kuzushijiPilotObjectiveDefinition.objectiveId,
  objectiveVersion: kuzushijiPilotObjectiveDefinition.objectiveVersion,
  evidenceUse: "srs",
});

/** Existing v1 binding collection stays unchanged; v2 is additive content. */
export const kuzushijiPilotV2ObjectiveBindings: readonly ExerciseObjectiveBinding[] = Object.freeze([
  kuzushijiPilotV2ObjectiveBinding,
]);

export const kuzushijiPilotObjectiveContentHash = hashObjectiveDefinition(kuzushijiPilotObjectiveDefinition);

assertValidExerciseObjectiveBinding(kuzushijiPilotObjectiveBinding);
assertValidExerciseObjectiveBinding(kuzushijiPilotV2ObjectiveBinding);
