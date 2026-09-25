import {
  PHILOSOPHY_ARCHE_EXERCISE_ID, PHILOSOPHY_ARCHE_SRS_EPOCH,
  PHILOSOPHY_ARCHE_TERM_ID, PHILOSOPHY_ARCHE_TERM_URL,
  philosophyArcheContentRelease, philosophyArcheObjectiveBinding,
  philosophyArcheObjectiveDefinition, philosophyArcheRevision, philosophyArcheRevisionPayload,
} from "./exercises/philosophy-anaximander.ts";
import {
  PHILOSOPHY_THALES_EXERCISE_ID, PHILOSOPHY_THALES_SUBJECT_ID, PHILOSOPHY_THALES_SUBJECT_URL,
  PHILOSOPHY_ANAXIMENES_EXERCISE_ID, PHILOSOPHY_ANAXIMENES_SUBJECT_ID,
  PHILOSOPHY_ANAXIMENES_SUBJECT_URL, philosophyThales, philosophyAnaximenes,
} from "./exercises/philosophy-arche-additions.ts";
import type { ExerciseRevision, ExerciseRevisionPayload, ContentRelease } from "./exercises/revision.ts";
import type { ObjectiveDefinition, ExerciseObjectiveBinding } from "./objectives.ts";

export type PhilosophyObjectiveEntry = Readonly<{
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

/** Order is curriculum authority: Thales, Anaximander, Anaximenes. */
export const philosophyObjectiveRegistry: readonly PhilosophyObjectiveEntry[] = Object.freeze([
  {
    exerciseId: PHILOSOPHY_THALES_EXERCISE_ID, objectiveId: PHILOSOPHY_THALES_EXERCISE_ID,
    scopeSubjectId: PHILOSOPHY_THALES_SUBJECT_ID, scopeSubjectUrl: PHILOSOPHY_THALES_SUBJECT_URL,
    srsEpoch: 1, revision: philosophyThales.revision, revisionPayload: philosophyThales.revisionPayload,
    contentRelease: philosophyThales.contentRelease, objectiveDefinition: philosophyThales.objectiveDefinition,
    objectiveBinding: philosophyThales.objectiveBinding,
  },
  {
    exerciseId: PHILOSOPHY_ARCHE_EXERCISE_ID, objectiveId: PHILOSOPHY_ARCHE_EXERCISE_ID,
    scopeSubjectId: PHILOSOPHY_ARCHE_TERM_ID, scopeSubjectUrl: PHILOSOPHY_ARCHE_TERM_URL,
    srsEpoch: PHILOSOPHY_ARCHE_SRS_EPOCH, revision: philosophyArcheRevision,
    revisionPayload: philosophyArcheRevisionPayload, contentRelease: philosophyArcheContentRelease,
    objectiveDefinition: philosophyArcheObjectiveDefinition, objectiveBinding: philosophyArcheObjectiveBinding,
  },
  {
    exerciseId: PHILOSOPHY_ANAXIMENES_EXERCISE_ID, objectiveId: PHILOSOPHY_ANAXIMENES_EXERCISE_ID,
    scopeSubjectId: PHILOSOPHY_ANAXIMENES_SUBJECT_ID, scopeSubjectUrl: PHILOSOPHY_ANAXIMENES_SUBJECT_URL,
    srsEpoch: 1, revision: philosophyAnaximenes.revision, revisionPayload: philosophyAnaximenes.revisionPayload,
    contentRelease: philosophyAnaximenes.contentRelease, objectiveDefinition: philosophyAnaximenes.objectiveDefinition,
    objectiveBinding: philosophyAnaximenes.objectiveBinding,
  },
]);

export function getPhilosophyObjectiveByExerciseId(exerciseId: string): PhilosophyObjectiveEntry | null {
  return philosophyObjectiveRegistry.find((entry) => entry.exerciseId === exerciseId) ?? null;
}

export const philosophyObjectiveScopeSubjectIds = Object.freeze(
  philosophyObjectiveRegistry.map((entry) => entry.scopeSubjectId),
);
