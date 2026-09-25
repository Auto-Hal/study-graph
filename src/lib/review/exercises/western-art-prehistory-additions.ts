import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
} from "./revision.ts";
import type { ExerciseDefinition, VisualAsset } from "./types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";

export const WESTERN_ART_LECTURE1_ID = "3bdd2793-4134-8105-8e0f-c17980f50ec8";
export const WESTERN_ART_LECTURE1_URL = "https://app.notion.com/p/3bdd2793413481058e0fc17980f50ec8";

export const WESTERN_ART_PALEOLITHIC_EXERCISE_ID = "western-art-history.paleolithic.period-recall";
export const WESTERN_ART_PALEOLITHIC_SUBJECT_ID = "3bdd2793-4134-8147-a3ee-d727377661ff";
export const WESTERN_ART_PALEOLITHIC_SUBJECT_URL = "https://app.notion.com/p/3bdd279341348147a3eed727377661ff";
export const WESTERN_ART_EXAGGERATION_EXERCISE_ID = "western-art-history.exaggeration.term-recall";
export const WESTERN_ART_EXAGGERATION_SUBJECT_ID = "3bdd2793-4134-81cc-b045-fa1e1c7b7ddd";
export const WESTERN_ART_EXAGGERATION_SUBJECT_URL = "https://app.notion.com/p/3bdd2793413481ccb045fa1e1c7b7ddd";
export const WESTERN_ART_ABSTRACTION_EXERCISE_ID = "western-art-history.abstraction.term-recall";
export const WESTERN_ART_ABSTRACTION_SUBJECT_ID = "3bdd2793-4134-81cb-aabb-c687e1b808ba";
export const WESTERN_ART_ABSTRACTION_SUBJECT_URL = "https://app.notion.com/p/3bdd2793413481cbaabbc687e1b808ba";

type PrehistoryFacts = Readonly<{
  exerciseId: string;
  subjectId: string;
  subjectUrl: string;
  subjectKind: "時代" | "用語";
  answer: string;
  prompt: string;
  explanation: string;
  action: string;
}>;

/** Git owns the answer; these Notion pages are immutable source citations and current Scope subjects. */
function buildPrehistoryObjective(facts: PrehistoryFacts) {
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
    front: "先史美術の基本概念",
    stimuli: [],
    answerSpec: { type: "text", acceptedAnswers: [facts.answer] },
    gradingSpec: { strategyId: "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
    explanation: { summary: facts.explanation },
    sources: [
      {
        kind: "text-reference",
        title: "第1回 人類はなぜ絵を描いたのか――先史時代と洞窟壁画",
        url: WESTERN_ART_LECTURE1_URL,
        attribution: "Study Graph Notion 講義 1",
      },
      {
        kind: "text-reference",
        title: facts.answer,
        url: facts.subjectUrl,
        attribution: `Study Graph Notion ${facts.subjectKind}`,
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
    title: `${facts.answer}という${facts.subjectKind}を想起する`,
    target: facts.answer,
    action: facts.action,
    responseMode: "recall",
    conditions: "テキストのみ。選択肢・ヒントなし。",
    successCriterion: `review-session-ja-v1 正規化後に「${facts.answer}」と一致する`,
  };
  const objectiveBinding: ExerciseObjectiveBinding = {
    revisionContentHash: revision.contentHash,
    objectiveId: facts.exerciseId,
    objectiveVersion: 1,
    evidenceUse: "srs",
  };
  return { definition, revision, revisionPayload, contentRelease, objectiveDefinition, objectiveBinding };
}

export const westernArtPaleolithic = buildPrehistoryObjective({
  exerciseId: WESTERN_ART_PALEOLITHIC_EXERCISE_ID,
  subjectId: WESTERN_ART_PALEOLITHIC_SUBJECT_ID,
  subjectUrl: WESTERN_ART_PALEOLITHIC_SUBJECT_URL,
  subjectKind: "時代",
  answer: "旧石器時代",
  prompt: "狩猟採集を基本とし、洞窟壁画や小型彫像などの造形が残された時代を何と呼びますか。漢字で答えてください。",
  explanation: "狩猟採集を基本とし、洞窟壁画や小型彫像が残された時代は旧石器時代です。",
  action: "先史美術が残された時代の名称を短答する",
});

export const westernArtExaggeration = buildPrehistoryObjective({
  exerciseId: WESTERN_ART_EXAGGERATION_EXERCISE_ID,
  subjectId: WESTERN_ART_EXAGGERATION_SUBJECT_ID,
  subjectUrl: WESTERN_ART_EXAGGERATION_SUBJECT_URL,
  subjectKind: "用語",
  answer: "誇張",
  prompt: "伝えたい意味や重要性を強調するため、対象の特定部分を実際以上に強く表現することを何と呼びますか。漢字で答えてください。",
  explanation: "対象の特定部分を実際以上に強く表現することは誇張です。",
  action: "特定部分を実際以上に強く表現する手法の名称を短答する",
});

export const westernArtAbstraction = buildPrehistoryObjective({
  exerciseId: WESTERN_ART_ABSTRACTION_EXERCISE_ID,
  subjectId: WESTERN_ART_ABSTRACTION_SUBJECT_ID,
  subjectUrl: WESTERN_ART_ABSTRACTION_SUBJECT_URL,
  subjectKind: "用語",
  answer: "抽象化",
  prompt: "対象の個別的・具体的特徴を整理または省略し、重要な特徴や意味を取り出して表現することを何と呼びますか。漢字で答えてください。",
  explanation: "対象の特徴を整理・省略して重要な特徴や意味を取り出すことは抽象化です。",
  action: "重要な特徴や意味を取り出して表現する手法の名称を短答する",
});
