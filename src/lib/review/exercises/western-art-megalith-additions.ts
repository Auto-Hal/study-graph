import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
} from "./revision.ts";
import type { ExerciseDefinition, VisualAsset } from "./types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";
import { WESTERN_ART_CROMLECH_LECTURE_URL } from "./western-art-cromlech.ts";

export const WESTERN_ART_MENHIR_EXERCISE_ID = "western-art-history.menhir.term-recall";
export const WESTERN_ART_MENHIR_SUBJECT_ID = "3c5d2793-4134-8110-a446-dbd92583d83f";
export const WESTERN_ART_MENHIR_SUBJECT_URL = "https://app.notion.com/p/3c5d279341348110a446dbd92583d83f";
export const WESTERN_ART_DOLMEN_EXERCISE_ID = "western-art-history.dolmen.term-recall";
export const WESTERN_ART_DOLMEN_SUBJECT_ID = "3c5d2793-4134-8130-8458-c3aa11c784dd";
export const WESTERN_ART_DOLMEN_SUBJECT_URL = "https://app.notion.com/p/3c5d2793413481308458c3aa11c784dd";
export const WESTERN_ART_TRILITHON_EXERCISE_ID = "western-art-history.trilithon.term-recall";
export const WESTERN_ART_TRILITHON_SUBJECT_ID = "3c5d2793-4134-8134-9e8b-d0721b3a9376";
export const WESTERN_ART_TRILITHON_SUBJECT_URL = "https://app.notion.com/p/3c5d2793413481349e8bd0721b3a9376";

type MegalithFacts = Readonly<{
  exerciseId: string;
  subjectId: string;
  subjectUrl: string;
  term: string;
  prompt: string;
  explanation: string;
  action: string;
}>;

function buildMegalith(facts: MegalithFacts) {
  const definition: ExerciseDefinition = {
    schemaVersion: 1,
    projectId: "western-art-history",
    exerciseId: facts.exerciseId,
    exerciseVersion: 1,
    domain: "western-art-history",
    objectiveId: facts.exerciseId,
    skill: "recall",
    category: "prehistoric-art",
    prompt: facts.prompt,
    front: "巨石記念物の形式",
    stimuli: [],
    answerSpec: { type: "text", acceptedAnswers: [facts.term] },
    gradingSpec: { strategyId: "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
    explanation: { summary: facts.explanation },
    sources: [
      {
        kind: "text-reference",
        title: "第2回 新石器革命と巨石文化――「描く」美術から「空間をつくる」美術へ",
        url: WESTERN_ART_CROMLECH_LECTURE_URL,
        attribution: "Study Graph Notion 講義 2",
      },
      {
        kind: "text-reference",
        title: facts.term,
        url: facts.subjectUrl,
        attribution: "Study Graph Notion 用語",
      },
    ],
    provenance: { status: "curated", approvedFrom: "manual-curation" },
    origin: "curated",
    status: "approved",
    relatedKnowledgeBindings: [{ source: "notion", externalId: facts.subjectId, role: "scope-subject" }],
  };
  const revision = createExerciseRevision(definition, new Map<string, VisualAsset>(), null);
  const revisionPayload = getExerciseRevisionPayload(revision);
  const contentRelease = createContentRelease(createContentReleaseManifest([revision]));
  const objectiveDefinition: ObjectiveDefinition = {
    projectId: "western-art-history",
    objectiveId: facts.exerciseId,
    objectiveVersion: 1,
    title: `${facts.term}という用語を想起する`,
    target: facts.term,
    action: facts.action,
    responseMode: "recall",
    conditions: "テキストのみ。選択肢・ヒントなし。",
    successCriterion: `review-session-ja-v1 正規化後に「${facts.term}」と一致する`,
  };
  const objectiveBinding: ExerciseObjectiveBinding = {
    revisionContentHash: revision.contentHash,
    objectiveId: facts.exerciseId,
    objectiveVersion: 1,
    evidenceUse: "srs",
  };
  return { definition, revision, revisionPayload, contentRelease, objectiveDefinition, objectiveBinding };
}

export const westernArtMenhir = buildMegalith({
  exerciseId: WESTERN_ART_MENHIR_EXERCISE_ID,
  subjectId: WESTERN_ART_MENHIR_SUBJECT_ID,
  subjectUrl: WESTERN_ART_MENHIR_SUBJECT_URL,
  term: "メンヒル",
  prompt: "単独または列状に垂直に立てられた巨石を何と呼びますか。カタカナで答えてください。",
  explanation: "単独または列状に垂直に立てられた巨石はメンヒルと呼ばれます。",
  action: "垂直に立てられた巨石の名称を短答する",
});

export const westernArtDolmen = buildMegalith({
  exerciseId: WESTERN_ART_DOLMEN_EXERCISE_ID,
  subjectId: WESTERN_ART_DOLMEN_SUBJECT_ID,
  subjectUrl: WESTERN_ART_DOLMEN_SUBJECT_URL,
  term: "ドルメン",
  prompt: "複数の支石の上に天井石を載せた構造を何と呼びますか。カタカナで答えてください。",
  explanation: "複数の支石の上に天井石を載せた構造はドルメンと呼ばれます。",
  action: "支石と天井石からなる構造の名称を短答する",
});

export const westernArtTrilithon = buildMegalith({
  exerciseId: WESTERN_ART_TRILITHON_EXERCISE_ID,
  subjectId: WESTERN_ART_TRILITHON_SUBJECT_ID,
  subjectUrl: WESTERN_ART_TRILITHON_SUBJECT_URL,
  term: "トリリトン",
  prompt: "2本の垂直石の上に1本の横石を載せた構造を何と呼びますか。カタカナで答えてください。",
  explanation: "2本の垂直石と1本の横石からなる構造はトリリトンと呼ばれます。",
  action: "2本の垂直石と1本の横石からなる構造の名称を短答する",
});
