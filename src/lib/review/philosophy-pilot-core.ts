import { canonicalizeJson, sha256Hex, hashExerciseRevision, type ExerciseRevisionPayload } from "./exercises/revision.ts";
import { getPhilosophyObjectiveByExerciseId, philosophyObjectiveRegistry, type PhilosophyObjectiveEntry } from "./philosophy-objective-registry.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import type { ReviewCard } from "./types.ts";

export function philosophyPilotEnabled(value: string | undefined): boolean {
  return value === "true";
}

export type PhilosophyPresentation = Readonly<{
  presentationVersion: 1;
  prompt: string;
  front: string;
  sourceUrl: string;
}>;

export function createPhilosophyPresentation(revision: ExerciseRevisionPayload, entry: PhilosophyObjectiveEntry = philosophyObjectiveRegistry[1]): PhilosophyPresentation {
  return { presentationVersion: 1, prompt: revision.prompt, front: revision.front, sourceUrl: entry.scopeSubjectUrl };
}

export function hashPhilosophyPresentation(presentation: PhilosophyPresentation): string {
  return sha256Hex(canonicalizeJson(presentation));
}

export class PhilosophyPilotInvariantError extends Error {
  constructor() { super("philosophy_pilot_instance_mismatch"); }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The database JSON is untrusted until its supported immutable grading contract is checked. */
export function decodePhilosophyRevision(value: unknown, instance: ResolvedObjectiveInstanceArchive, entry: PhilosophyObjectiveEntry): ExerciseRevisionPayload {
  if (!record(value) || !record(value.answerSpec) || !record(value.gradingSpec)
    || value.projectId !== "philosophy" || value.exerciseId !== entry.exerciseId
    || value.exerciseVersion !== instance.exercise_version || value.objectiveId !== entry.objectiveId
    || value.status !== "approved" || value.answerSpec.type !== "text"
    || !Array.isArray(value.answerSpec.acceptedAnswers)
    || value.answerSpec.acceptedAnswers.length === 0
    || !value.answerSpec.acceptedAnswers.every((answer) => typeof answer === "string" && answer.trim().length > 0)
    || value.gradingSpec.strategyId !== "legacy-text-v1"
    || value.gradingSpec.strategyVersion !== 1
    || value.gradingSpec.normalization !== "review-session-ja-v1"
    || typeof value.prompt !== "string" || !value.prompt.trim()
    || typeof value.front !== "string" || !value.front.trim()
    || value.schemaVersion !== 1 || value.canonicalizationVersion !== 1
    || !Array.isArray(value.stimuli) || value.stimuli.length !== 0
    || !Array.isArray(value.visualAssets) || value.visualAssets.length !== 0
    || !record(value.explanation) || typeof value.explanation.summary !== "string"
    || !Array.isArray(value.sources) || value.sources.length === 0
    || value.pilotMetadata !== null
    || !Array.isArray(value.relatedKnowledgeBindings)
    || !value.relatedKnowledgeBindings.some((binding) => record(binding)
      && binding.source === "notion" && binding.externalId === entry.scopeSubjectId && binding.role === "scope-subject")) {
    throw new PhilosophyPilotInvariantError();
  }
  const revision = value as ExerciseRevisionPayload;
  if (hashExerciseRevision(revision) !== instance.content_hash) throw new PhilosophyPilotInvariantError();
  return revision;
}

export function decodePhilosophyInstance(instance: ResolvedObjectiveInstanceArchive, issued?: {
  instanceId: string; releaseId: string; revisionId: string;
}) {
  const entry = getPhilosophyObjectiveByExerciseId(instance.exercise_id);
  if (!entry || instance.project_id !== "philosophy"
    || instance.revision_status !== "approved"
    || typeof instance.release_id !== "string" || !instance.release_id.trim()
    || typeof instance.revision_id !== "string" || !instance.revision_id.trim()
    || !Number.isSafeInteger(instance.exercise_version) || instance.exercise_version < 1
    || instance.srs_target !== "objective"
    || String(instance.srs_epoch) !== String(entry.srsEpoch)
    || instance.legacy_item_id !== entry.scopeSubjectId
    || instance.legacy_item_kind !== "knowledge"
    || instance.legacy_exercise_id !== entry.exerciseId
    || (issued && (instance.instance_id !== issued.instanceId || instance.release_id !== issued.releaseId || instance.revision_id !== issued.revisionId))) {
    throw new PhilosophyPilotInvariantError();
  }
  const revision = decodePhilosophyRevision(instance.revision_payload, instance, entry);
  const presentation = instance.presentation;
  if (!record(presentation) || presentation.presentationVersion !== 1
    || typeof presentation.prompt !== "string" || !presentation.prompt.trim()
    || typeof presentation.front !== "string" || !presentation.front.trim()
    || presentation.sourceUrl !== entry.scopeSubjectUrl
    || !revision.sources.some((source) => source.url === presentation.sourceUrl && source.url.startsWith("https://"))
    || presentation.prompt !== revision.prompt || presentation.front !== revision.front
    || sha256Hex(canonicalizeJson(presentation)) !== instance.presentation_hash) {
    throw new PhilosophyPilotInvariantError();
  }
  return {
    entry,
    instance,
    revision,
    presentation: {
      presentationVersion: 1 as const,
      prompt: presentation.prompt,
      front: presentation.front,
      sourceUrl: presentation.sourceUrl,
    },
  };
}

export function philosophyCardFromPersisted(value: ReturnType<typeof decodePhilosophyInstance>, opportunityKind: "unseen" | "due" | "practice"): ReviewCard {
  return {
    id: value.entry.scopeSubjectId,
    exerciseId: value.instance.exercise_id,
    projectId: "philosophy",
    kind: "knowledge",
    kindLabel: "用語",
    eyebrow: "OBJECTIVE",
    label: value.presentation.front,
    prompt: value.presentation.prompt,
    front: value.presentation.front,
    frontStyle: "title",
    reason: opportunityKind === "due" ? "Objective 復習期限到来" : "Objective 初回復習",
    answer: value.revision.answerSpec,
    answerRows: [
      { label: "正解", value: value.revision.answerSpec.acceptedAnswers[0] },
      { label: "要点", value: value.revision.explanation.summary },
    ],
    sourceUrl: value.presentation.sourceUrl,
    persistenceKind: "versioned-pilot",
    instanceId: value.instance.instance_id,
  };
}
