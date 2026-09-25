import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
  type ExerciseRevisionPayload,
} from "./revision.ts";
import type { ExerciseDefinition, VisualAsset } from "./types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";

export const WESTERN_ART_CROMLECH_EXERCISE_ID = "western-art-history.cromlech.term-recall";
export const WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID = "3c5d2793-4134-8155-9d48-cb8a71d01f66";
export const WESTERN_ART_CROMLECH_LECTURE_ID = "3c5d2793-4134-816b-8acb-d847d0e539e6";
export const WESTERN_ART_CROMLECH_SRS_EPOCH = 1;
export const WESTERN_ART_CROMLECH_LECTURE_URL = "https://app.notion.com/p/3c5d27934134816b8acbd847d0e539e6";
export const WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL = "https://app.notion.com/p/3c5d2793413481559d48cb8a71d01f66";

/** Git owns the immutable grading contract; Notion supplies Scope/context only. */
export const westernArtCromlechDefinition: ExerciseDefinition = {
  schemaVersion: 1,
  projectId: "western-art-history",
  exerciseId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  exerciseVersion: 1,
  domain: "western-art-history",
  objectiveId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  skill: "recall",
  category: "prehistoric-art",
  prompt: "巨石を環状に配置した構造を何と呼びますか。カタカナで答えてください。",
  front: "巨石記念物の形式",
  stimuli: [],
  answerSpec: { type: "text", acceptedAnswers: ["クロムレック"] },
  gradingSpec: { strategyId: "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
  explanation: { summary: "巨石を環状に配置した構造はクロムレックと呼ばれます。" },
  sources: [
    {
      kind: "text-reference",
      title: "第2回 新石器革命と巨石文化――「描く」美術から「空間をつくる」美術へ",
      url: WESTERN_ART_CROMLECH_LECTURE_URL,
      attribution: "Study Graph Notion 講義 2",
    },
    {
      kind: "text-reference",
      title: "クロムレック",
      url: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL,
      attribution: "Study Graph Notion 用語",
    },
  ],
  provenance: { status: "curated", approvedFrom: "manual-curation" },
  origin: "curated",
  status: "approved",
  relatedKnowledgeBindings: [{
    source: "notion",
    externalId: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID,
    role: "scope-subject",
  }],
};

export const westernArtCromlechRevision = createExerciseRevision(
  westernArtCromlechDefinition,
  new Map<string, VisualAsset>(),
  null,
);
export const westernArtCromlechRevisionPayload: ExerciseRevisionPayload = getExerciseRevisionPayload(
  westernArtCromlechRevision,
);
export const westernArtCromlechContentRelease = createContentRelease(
  createContentReleaseManifest([westernArtCromlechRevision]),
);

export const westernArtCromlechObjectiveDefinition: ObjectiveDefinition = {
  projectId: "western-art-history",
  objectiveId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  objectiveVersion: 1,
  title: "クロムレックという用語を想起する",
  target: "クロムレック",
  action: "巨石を環状に配置した構造の名称を短答する",
  responseMode: "recall",
  conditions: "テキストのみ。選択肢・ヒントなし。",
  successCriterion: "review-session-ja-v1 正規化後に「クロムレック」と一致する",
};

export const westernArtCromlechObjectiveBinding: ExerciseObjectiveBinding = {
  revisionContentHash: westernArtCromlechRevision.contentHash,
  objectiveId: WESTERN_ART_CROMLECH_EXERCISE_ID,
  objectiveVersion: 1,
  evidenceUse: "srs",
};
