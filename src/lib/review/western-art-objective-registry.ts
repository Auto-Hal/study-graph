import {
  WESTERN_ART_CROMLECH_EXERCISE_ID,
  WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID,
  WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL,
  WESTERN_ART_CROMLECH_SRS_EPOCH,
  westernArtCromlechContentRelease,
  westernArtCromlechObjectiveBinding,
  westernArtCromlechObjectiveDefinition,
  westernArtCromlechRevision,
  westernArtCromlechRevisionPayload,
} from "./exercises/western-art-cromlech.ts";

export const westernArtObjective = Object.freeze({
  exerciseId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  objectiveId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  scopeSubjectId: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID,
  scopeSubjectUrl: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL,
  srsEpoch: WESTERN_ART_CROMLECH_SRS_EPOCH,
  revision: westernArtCromlechRevision,
  revisionPayload: westernArtCromlechRevisionPayload,
  contentRelease: westernArtCromlechContentRelease,
  objectiveDefinition: westernArtCromlechObjectiveDefinition,
  objectiveBinding: westernArtCromlechObjectiveBinding,
});

export type WesternArtObjectiveEntry = typeof westernArtObjective;

export function getWesternArtObjectiveByExerciseId(exerciseId: string): WesternArtObjectiveEntry | null {
  return exerciseId === westernArtObjective.exerciseId ? westernArtObjective : null;
}
