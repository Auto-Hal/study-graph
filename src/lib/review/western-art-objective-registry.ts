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
import {
  WESTERN_ART_MENHIR_EXERCISE_ID, WESTERN_ART_MENHIR_SUBJECT_ID, WESTERN_ART_MENHIR_SUBJECT_URL,
  WESTERN_ART_DOLMEN_EXERCISE_ID, WESTERN_ART_DOLMEN_SUBJECT_ID, WESTERN_ART_DOLMEN_SUBJECT_URL,
  WESTERN_ART_TRILITHON_EXERCISE_ID, WESTERN_ART_TRILITHON_SUBJECT_ID, WESTERN_ART_TRILITHON_SUBJECT_URL,
  westernArtMenhir, westernArtDolmen, westernArtTrilithon,
} from "./exercises/western-art-megalith-additions.ts";
import {
  WESTERN_ART_PALEOLITHIC_EXERCISE_ID, WESTERN_ART_PALEOLITHIC_SUBJECT_ID, WESTERN_ART_PALEOLITHIC_SUBJECT_URL,
  WESTERN_ART_EXAGGERATION_EXERCISE_ID, WESTERN_ART_EXAGGERATION_SUBJECT_ID, WESTERN_ART_EXAGGERATION_SUBJECT_URL,
  WESTERN_ART_ABSTRACTION_EXERCISE_ID, WESTERN_ART_ABSTRACTION_SUBJECT_ID, WESTERN_ART_ABSTRACTION_SUBJECT_URL,
  westernArtPaleolithic, westernArtExaggeration, westernArtAbstraction,
} from "./exercises/western-art-prehistory-additions.ts";
import type { ContentRelease, ExerciseRevision, ExerciseRevisionPayload } from "./exercises/revision.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "./objectives.ts";

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

export type WesternArtObjectiveEntry = Readonly<{
  exerciseId: string;
  objectiveId: string;
  scopeSubjectId: string;
  scopeSubjectUrl: string;
  srsEpoch: number;
  revision: ExerciseRevision;
  revisionPayload: ExerciseRevisionPayload;
  contentRelease: ContentRelease;
  objectiveDefinition: ObjectiveDefinition;
  objectiveBinding: ExerciseObjectiveBinding;
}>;

/** Trusted curriculum order. Each Objective retains independent DB scheduling authority. */
export const westernArtObjectiveRegistry: readonly WesternArtObjectiveEntry[] = Object.freeze([
  {
    exerciseId: WESTERN_ART_PALEOLITHIC_EXERCISE_ID, objectiveId: WESTERN_ART_PALEOLITHIC_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_PALEOLITHIC_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_PALEOLITHIC_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtPaleolithic.revision, revisionPayload: westernArtPaleolithic.revisionPayload,
    contentRelease: westernArtPaleolithic.contentRelease, objectiveDefinition: westernArtPaleolithic.objectiveDefinition,
    objectiveBinding: westernArtPaleolithic.objectiveBinding,
  },
  {
    exerciseId: WESTERN_ART_EXAGGERATION_EXERCISE_ID, objectiveId: WESTERN_ART_EXAGGERATION_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_EXAGGERATION_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_EXAGGERATION_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtExaggeration.revision, revisionPayload: westernArtExaggeration.revisionPayload,
    contentRelease: westernArtExaggeration.contentRelease, objectiveDefinition: westernArtExaggeration.objectiveDefinition,
    objectiveBinding: westernArtExaggeration.objectiveBinding,
  },
  {
    exerciseId: WESTERN_ART_ABSTRACTION_EXERCISE_ID, objectiveId: WESTERN_ART_ABSTRACTION_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_ABSTRACTION_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_ABSTRACTION_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtAbstraction.revision, revisionPayload: westernArtAbstraction.revisionPayload,
    contentRelease: westernArtAbstraction.contentRelease, objectiveDefinition: westernArtAbstraction.objectiveDefinition,
    objectiveBinding: westernArtAbstraction.objectiveBinding,
  },
  {
    exerciseId: WESTERN_ART_MENHIR_EXERCISE_ID, objectiveId: WESTERN_ART_MENHIR_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_MENHIR_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_MENHIR_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtMenhir.revision, revisionPayload: westernArtMenhir.revisionPayload,
    contentRelease: westernArtMenhir.contentRelease, objectiveDefinition: westernArtMenhir.objectiveDefinition,
    objectiveBinding: westernArtMenhir.objectiveBinding,
  },
  {
    exerciseId: WESTERN_ART_DOLMEN_EXERCISE_ID, objectiveId: WESTERN_ART_DOLMEN_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_DOLMEN_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_DOLMEN_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtDolmen.revision, revisionPayload: westernArtDolmen.revisionPayload,
    contentRelease: westernArtDolmen.contentRelease, objectiveDefinition: westernArtDolmen.objectiveDefinition,
    objectiveBinding: westernArtDolmen.objectiveBinding,
  },
  westernArtObjective,
  {
    exerciseId: WESTERN_ART_TRILITHON_EXERCISE_ID, objectiveId: WESTERN_ART_TRILITHON_EXERCISE_ID,
    scopeSubjectId: WESTERN_ART_TRILITHON_SUBJECT_ID, scopeSubjectUrl: WESTERN_ART_TRILITHON_SUBJECT_URL,
    srsEpoch: 1, revision: westernArtTrilithon.revision, revisionPayload: westernArtTrilithon.revisionPayload,
    contentRelease: westernArtTrilithon.contentRelease, objectiveDefinition: westernArtTrilithon.objectiveDefinition,
    objectiveBinding: westernArtTrilithon.objectiveBinding,
  },
]);

export const westernArtObjectiveScopeSubjectIds = Object.freeze(
  westernArtObjectiveRegistry.map((entry) => entry.scopeSubjectId),
);

export function getWesternArtObjectiveByExerciseId(exerciseId: string): WesternArtObjectiveEntry | null {
  return westernArtObjectiveRegistry.find((entry) => entry.exerciseId === exerciseId) ?? null;
}
