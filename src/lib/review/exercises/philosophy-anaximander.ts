import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
  type ExerciseRevisionPayload,
} from "./revision.ts";
import type { ExerciseDefinition, VisualAsset } from "./types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";

export const PHILOSOPHY_ARCHE_EXERCISE_ID = "philosophy.anaximander.arche-recall";
export const PHILOSOPHY_ARCHE_TERM_ID = "3bdd2793-4134-81db-bc14-cbb389912018";
export const PHILOSOPHY_ARCHE_LECTURE_ID = "3bdd2793-4134-8105-904b-d47a4f0f6f52";
export const PHILOSOPHY_ARCHE_SRS_EPOCH = 1;
export const PHILOSOPHY_ARCHE_TERM_URL = "https://app.notion.com/p/3bdd2793413481dbbc14cbb389912018";
export const PHILOSOPHY_ARCHE_LECTURE_URL = "https://app.notion.com/p/3bdd279341348105904bd47a4f0f6f52";

/** Git-owned text-only content. The Notion pages supply Scope, never the answer. */
export const philosophyArcheDefinition: ExerciseDefinition = {
  schemaVersion: 1,
  projectId: "philosophy",
  exerciseId: PHILOSOPHY_ARCHE_EXERCISE_ID,
  exerciseVersion: 1,
  domain: "philosophy",
  objectiveId: PHILOSOPHY_ARCHE_EXERCISE_ID,
  skill: "recall",
  category: "ancient-greek-philosophy",
  prompt: "アナクシマンドロスが万物のアルケー（根源）としたものを、カタカナで答えてください。",
  front: "アナクシマンドロス",
  stimuli: [],
  answerSpec: { type: "text", acceptedAnswers: ["アペイロン"] },
  gradingSpec: { strategyId: "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
  explanation: { summary: "アナクシマンドロスはアルケーをアペイロンとしました。" },
  sources: [
    { kind: "text-reference", title: "01_なぜ哲学はギリシアで始まったのか", url: PHILOSOPHY_ARCHE_LECTURE_URL, attribution: "Study Graph Notion 講義 1" },
    { kind: "text-reference", title: "アペイロン", url: PHILOSOPHY_ARCHE_TERM_URL, attribution: "Study Graph Notion 用語" },
  ],
  provenance: { status: "curated", approvedFrom: "manual-curation" },
  origin: "curated",
  status: "approved",
  relatedKnowledgeBindings: [{ source: "notion", externalId: PHILOSOPHY_ARCHE_TERM_ID, role: "scope-subject" }],
};

export const philosophyArcheRevision = createExerciseRevision(
  philosophyArcheDefinition, new Map<string, VisualAsset>(), null,
);
export const philosophyArcheRevisionPayload: ExerciseRevisionPayload = getExerciseRevisionPayload(philosophyArcheRevision);
export const philosophyArcheContentRelease = createContentRelease(createContentReleaseManifest([philosophyArcheRevision]));

export const philosophyArcheObjectiveDefinition: ObjectiveDefinition = {
  projectId: "philosophy",
  objectiveId: PHILOSOPHY_ARCHE_EXERCISE_ID,
  objectiveVersion: 1,
  title: "アナクシマンドロスのアルケーを想起する",
  target: "アペイロン",
  action: "アナクシマンドロスがアルケーとして提示した概念名を短答する",
  responseMode: "recall",
  conditions: "テキストのみ。選択肢・ヒントなし。",
  successCriterion: "review-session-ja-v1 正規化後に「アペイロン」と一致する",
};

export const philosophyArcheObjectiveBinding: ExerciseObjectiveBinding = {
  revisionContentHash: philosophyArcheRevision.contentHash,
  objectiveId: PHILOSOPHY_ARCHE_EXERCISE_ID,
  objectiveVersion: 1,
  evidenceUse: "srs",
};
