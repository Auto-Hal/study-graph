import { createContentRelease, createContentReleaseManifest, createExerciseRevision, getExerciseRevisionPayload } from "../exercises/revision.ts";
import type { ExerciseDefinition, ExerciseSource, ExplanationRubric, VisualAsset } from "../exercises/types.ts";
import type { ExerciseObjectiveBinding, ObjectiveDefinition } from "../objectives.ts";
import type { UnitProjectId } from "./catalog.ts";

export type UnitExercise = Readonly<{
  exerciseId: string;
  objectiveId: string;
  scopeSubjectId: string;
  scopeSubjectUrl: string;
  srsEpoch: number;
  revision: ReturnType<typeof createExerciseRevision>;
  revisionPayload: ReturnType<typeof getExerciseRevisionPayload>;
  contentRelease: ReturnType<typeof createContentRelease>;
  objectiveDefinition: ObjectiveDefinition;
  objectiveBinding: ExerciseObjectiveBinding;
}>;

export function buildUnitExercise(facts: {
  projectId: UnitProjectId; exerciseId: string; subjectId: string; subjectUrl: string;
  title: string; prompt: string; explanation: string; answers?: string[];
  rubric?: ExplanationRubric; asset?: VisualAsset; comparisonAsset?: VisualAsset; lectureUrl: string; additionalSources?: readonly ExerciseSource[];
}): UnitExercise {
  const assets = [facts.asset, facts.comparisonAsset].filter((asset): asset is VisualAsset => Boolean(asset));
  const definition: ExerciseDefinition = {
    schemaVersion: 1, exerciseId: facts.exerciseId, exerciseVersion: 1,
    projectId: facts.projectId, domain: facts.projectId, objectiveId: facts.exerciseId,
    skill: facts.rubric ? "explain" : "recall", category: "introductory-unit",
    prompt: facts.prompt, front: facts.title,
    stimuli: assets.map((asset, index) => ({ assetId: asset.assetId, assetVersion: 1, role: index === 0 ? "primary" : "secondary" })),
    // A rubric deliberately has no exact-match answers. Its self-evaluation is stored separately.
    answerSpec: { type: "text", acceptedAnswers: facts.answers ?? [] },
    gradingSpec: { strategyId: facts.rubric ? "rubric-self-evaluation-v1" : "legacy-text-v1", strategyVersion: 1, normalization: "review-session-ja-v1" },
    explanation: { summary: facts.explanation, ...(facts.rubric ? { rubric: facts.rubric } : {}) },
    sources: [
      { kind: "text-reference", title: "Notion 講義", url: facts.lectureUrl, attribution: "Study Graph Notion 教材" },
      { kind: "text-reference", title: facts.title, url: facts.subjectUrl, attribution: "Study Graph Notion 知識" },
      ...assets.map(asset => asset.source),
      ...(facts.additionalSources ?? []),
    ],
    provenance: { status: "curated", approvedFrom: "manual-curation" },
    origin: "curated", status: "approved",
    relatedKnowledgeBindings: [{ source: "notion", externalId: facts.subjectId, role: "scope-subject" }],
  };
  const revision = createExerciseRevision(definition, new Map(assets.map(asset => [asset.assetId, asset])), null);
  const objectiveDefinition: ObjectiveDefinition = {
    projectId: facts.projectId, objectiveId: facts.exerciseId, objectiveVersion: 1,
    title: facts.title, target: facts.title, action: facts.prompt,
    responseMode: facts.rubric ? "production" : "recall",
    conditions: "単元練習。解答前にヒントを表示しない。",
    successCriterion: facts.rubric ? "模範解答と評価観点を読み、言い換えを許容して自己評価する。自動正誤判定はしない。" : "保存した短答の別表記と照合する。",
  };
  return {
    exerciseId: facts.exerciseId, objectiveId: facts.exerciseId,
    scopeSubjectId: facts.subjectId, scopeSubjectUrl: facts.subjectUrl, srsEpoch: 1,
    revision, revisionPayload: getExerciseRevisionPayload(revision),
    contentRelease: createContentRelease(createContentReleaseManifest([revision])),
    objectiveDefinition,
    objectiveBinding: { revisionContentHash: revision.contentHash, objectiveId: facts.exerciseId, objectiveVersion: 1, evidenceUse: "practice-only" },
  };
}

