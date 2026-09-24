import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
  type ContentRelease,
  type ContentReleaseManifest,
  type ExerciseRevision,
  type ExerciseRevisionPayload,
} from "../revision.ts";
import type {
  ExerciseDefinition,
  TextReferenceSource,
  VisualAsset,
} from "../types.ts";
import type {
  ExerciseObjectiveBinding,
  ObjectiveDefinition,
} from "../../objectives.ts";

export const philosophyTestTextReferenceSource: TextReferenceSource = {
  kind: "text-reference",
  title: "Anaximander review fixture",
  url: "https://example.invalid/phase5a-3a-philosophy-fixture",
  attribution: "TEST fixture; not a production citation",
};

export const philosophyArcheDefinition: ExerciseDefinition = {
  schemaVersion: 1,
  exerciseId: "philosophy.anaximander.arche-recall",
  exerciseVersion: 1,
  projectId: "philosophy",
  domain: "philosophy",
  objectiveId: "philosophy.anaximander.arche-recall",
  skill: "recall",
  category: "ancient-greek-philosophy",
  prompt: "アナクシマンドロスが万物のアルケー（根源）としたものを、カタカナで答えてください。",
  front: "アナクシマンドロス",
  stimuli: [],
  answerSpec: { type: "text", acceptedAnswers: ["アペイロン"] },
  gradingSpec: {
    strategyId: "legacy-text-v1",
    strategyVersion: 1,
    normalization: "review-session-ja-v1",
  },
  explanation: { summary: "アナクシマンドロスはアルケーをアペイロンとしました。" },
  sources: [philosophyTestTextReferenceSource],
  provenance: { status: "curated", approvedFrom: "manual-curation" },
  origin: "curated",
  status: "approved",
  relatedKnowledgeBindings: [],
};

export const philosophyArcheRevision: ExerciseRevision = createExerciseRevision(
  philosophyArcheDefinition,
  new Map<string, VisualAsset>(),
  null,
);

export const philosophyArcheRevisionPayload: ExerciseRevisionPayload =
  getExerciseRevisionPayload(philosophyArcheRevision);

export const philosophyArcheManifest: ContentReleaseManifest =
  createContentReleaseManifest([philosophyArcheRevision]);

export const philosophyArcheContentRelease: ContentRelease = createContentRelease(
  philosophyArcheManifest,
  { sourceGitSha: "phase5a-3a-test-source-sha" },
);

export const philosophyArcheObjectiveDefinition: ObjectiveDefinition = {
  projectId: philosophyArcheDefinition.projectId,
  objectiveId: philosophyArcheDefinition.objectiveId,
  objectiveVersion: 1,
  title: "Recall Anaximander's arche",
  target: "apeiron",
  action: "recall",
  responseMode: "recall",
  conditions: "given Anaximander's name",
  successCriterion: "states Apeiron as the arche",
};

export const philosophyArcheObjectiveBinding: ExerciseObjectiveBinding = {
  revisionContentHash: philosophyArcheRevision.contentHash,
  objectiveId: philosophyArcheDefinition.objectiveId,
  objectiveVersion: philosophyArcheObjectiveDefinition.objectiveVersion,
  evidenceUse: "srs",
};
