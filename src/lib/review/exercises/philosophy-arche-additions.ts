import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
} from "./revision.ts";
import type { ExerciseDefinition, VisualAsset } from "./types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";
import { PHILOSOPHY_ARCHE_LECTURE_URL } from "./philosophy-anaximander.ts";

export const PHILOSOPHY_THALES_EXERCISE_ID = "philosophy.thales.arche-recall";
export const PHILOSOPHY_THALES_SUBJECT_ID = "3bdd2793-4134-819f-811b-e90baae5becc";
export const PHILOSOPHY_THALES_SUBJECT_URL = "https://app.notion.com/p/3bdd27934134819f811be90baae5becc";
export const PHILOSOPHY_ANAXIMENES_EXERCISE_ID = "philosophy.anaximenes.arche-recall";
export const PHILOSOPHY_ANAXIMENES_SUBJECT_ID = "3bdd2793-4134-811e-8788-c051a60154fb";
export const PHILOSOPHY_ANAXIMENES_SUBJECT_URL = "https://app.notion.com/p/3bdd27934134811e8788c051a60154fb";

function makeArcheExercise(facts: {
  exerciseId: string;
  subjectId: string;
  subjectUrl: string;
  front: string;
  prompt: string;
  answer: string;
  explanation: string;
  action: string;
}): ExerciseDefinition {
  return {
    schemaVersion: 1,
    projectId: "philosophy",
    exerciseId: facts.exerciseId,
    exerciseVersion: 1,
    domain: "philosophy",
    objectiveId: facts.exerciseId,
    skill: "recall",
    category: "ancient-greek-philosophy",
    prompt: facts.prompt,
    front: facts.front,
    stimuli: [],
    answerSpec: { type: "text", acceptedAnswers: [facts.answer] },
    gradingSpec: { strategyId: "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
    explanation: { summary: facts.explanation },
    sources: [
      { kind: "text-reference", title: "01_なぜ哲学はギリシアで始まったのか", url: PHILOSOPHY_ARCHE_LECTURE_URL, attribution: "Study Graph Notion 講義 1" },
      { kind: "text-reference", title: facts.front, url: facts.subjectUrl, attribution: "Study Graph Notion 人物" },
    ],
    provenance: { status: "curated", approvedFrom: "manual-curation" },
    origin: "curated",
    status: "approved",
    relatedKnowledgeBindings: [{ source: "notion", externalId: facts.subjectId, role: "scope-subject" }],
  };
}

function makeArcheObjective(facts: {
  exerciseId: string;
  front: string;
  answer: string;
  action: string;
}): ObjectiveDefinition {
  return {
    projectId: "philosophy",
    objectiveId: facts.exerciseId,
    objectiveVersion: 1,
    title: `${facts.front}のアルケーを想起する`,
    target: facts.answer,
    action: facts.action,
    responseMode: "recall",
    conditions: "テキストのみ。選択肢・ヒントなし。",
    successCriterion: `review-session-ja-v1 正規化後に「${facts.answer}」と一致する`,
  };
}

function buildArche(facts: Parameters<typeof makeArcheExercise>[0]) {
  const definition = makeArcheExercise(facts);
  const revision = createExerciseRevision(definition, new Map<string, VisualAsset>(), null);
  const revisionPayload = getExerciseRevisionPayload(revision);
  const contentRelease = createContentRelease(createContentReleaseManifest([revision]));
  const objectiveDefinition = makeArcheObjective(facts);
  const objectiveBinding: ExerciseObjectiveBinding = {
    revisionContentHash: revision.contentHash,
    objectiveId: facts.exerciseId,
    objectiveVersion: 1,
    evidenceUse: "srs",
  };
  return { definition, revision, revisionPayload, contentRelease, objectiveDefinition, objectiveBinding };
}

export const philosophyThales = buildArche({
  exerciseId: PHILOSOPHY_THALES_EXERCISE_ID,
  subjectId: PHILOSOPHY_THALES_SUBJECT_ID,
  subjectUrl: PHILOSOPHY_THALES_SUBJECT_URL,
  front: "タレス",
  prompt: "タレスが万物のアルケー（根源）としたものを答えてください。",
  answer: "水",
  explanation: "タレスは万物のアルケーを水と考えました。",
  action: "タレスがアルケーとして提示したものを短答する",
});

export const philosophyAnaximenes = buildArche({
  exerciseId: PHILOSOPHY_ANAXIMENES_EXERCISE_ID,
  subjectId: PHILOSOPHY_ANAXIMENES_SUBJECT_ID,
  subjectUrl: PHILOSOPHY_ANAXIMENES_SUBJECT_URL,
  front: "アナクシメネス",
  prompt: "アナクシメネスが万物のアルケー（根源）としたものを答えてください。",
  answer: "空気",
  explanation: "アナクシメネスは万物のアルケーを空気と考えました。",
  action: "アナクシメネスがアルケーとして提示したものを短答する",
});
