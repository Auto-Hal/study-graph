import { canonicalizeJson, getExerciseRevisionPayload, sha256Hex } from "../exercises/revision.ts";
import type { ResolvedObjectiveInstanceArchive } from "../../supabase/objective-archive.ts";
import type { ObjectiveInstanceRouting } from "../objective-runtime-core.ts";
import { ObjectiveRuntimeError } from "../objective-runtime-core.ts";
import type { VisualAsset } from "../exercises/types.ts";
import type { ReviewCard } from "../types.ts";
import { getStudyUnit } from "./catalog.ts";
import { findUnitExercise, type UnitExercise } from "./registry.ts";

export function unitPresentation(unitId: string, entry: UnitExercise) {
  return {
    unitPresentationVersion: 1, unitId,
    prompt: entry.revisionPayload.prompt, front: entry.revisionPayload.front,
    sourceUrl: entry.scopeSubjectUrl,
  };
}

export function isUnitInstance(instance: ResolvedObjectiveInstanceArchive) {
  const presentation = instance.presentation as Record<string, unknown> | null;
  return presentation?.unitPresentationVersion === 1;
}

/** Compare archived content with the trusted immutable unit revision before using any answer. */
export function decodeUnitInstance(instance: ResolvedObjectiveInstanceArchive) {
  const presentation = instance.presentation as Record<string, unknown> | null;
  const unit = getStudyUnit(typeof presentation?.unitId === "string" ? presentation.unitId : null);
  const entry = unit ? findUnitExercise(unit.id, instance.exercise_id) : null;
  if (!unit || !entry || instance.project_id !== unit.projectId
    || instance.revision_status !== "approved" || instance.srs_target !== "objective"
    || instance.exercise_version !== entry.revision.exerciseVersion
    || instance.content_hash !== entry.revision.contentHash
    || instance.legacy_item_id !== entry.scopeSubjectId
    || instance.legacy_item_kind !== (unit.projectId === "kuzushiji" ? "character" : "knowledge")
    || instance.legacy_exercise_id !== entry.exerciseId
    || String(instance.srs_epoch) !== String(entry.srsEpoch)
    || canonicalizeJson(instance.revision_payload) !== canonicalizeJson(getExerciseRevisionPayload(entry.revision))
    || canonicalizeJson(presentation) !== canonicalizeJson(unitPresentation(unit.id, entry))
    || instance.presentation_hash !== sha256Hex(canonicalizeJson(presentation))) {
    throw new ObjectiveRuntimeError("invalid_authority_response");
  }
  return { unit, entry, instance };
}

export function assertUnitRouting(routing: ObjectiveInstanceRouting, decoded: ReturnType<typeof decodeUnitInstance>) {
  const { unit, entry, instance } = decoded;
  if (routing.instanceId !== instance.instance_id || routing.projectId !== unit.projectId
    || routing.objectiveId !== entry.objectiveId || routing.objectiveVersion !== entry.objectiveDefinition.objectiveVersion
    || routing.srsEpoch !== entry.srsEpoch || routing.acceptanceVersion !== "v2"
    || routing.evidenceUse !== "practice-only" || routing.context.kind !== "v2"
    || routing.context.schedulingContext.opportunityKind !== "practice") {
    throw new ObjectiveRuntimeError("acceptance_version_mismatch");
  }
}

function asReviewAsset(asset: VisualAsset) {
  return { type: "image" as const, src: asset.src, alt: asset.alt, width: asset.width, height: asset.height, presentation: "full" as const, attribution: asset.source.attribution, sourceUrl: asset.source.url, license: asset.source.license };
}

export function unitCardFromPersisted(decoded: ReturnType<typeof decodeUnitInstance>): ReviewCard {
  const { unit, entry, instance } = decoded;
  const revision = instance.revision_payload as UnitExercise["revisionPayload"];
  const rubric = revision.explanation.rubric;
  const asset = revision.visualAssets[0];
  const comparisonAssets = revision.stimuli.filter(s => s.role === "secondary").map(s => revision.visualAssets.find(a => a.assetId === s.assetId)!).map(asReviewAsset);
  return {
    id: entry.exerciseId, exerciseId: entry.exerciseId, projectId: unit.projectId,
    kind: unit.projectId === "kuzushiji" ? "character" : "knowledge",
    kindLabel: rubric ? "説明・自己評価" : asset ? unit.projectId === "kuzushiji" ? "字形の読み" : "画像を見て短答" : "短答",
    eyebrow: unit.title, label: revision.front,
    prompt: revision.prompt, front: revision.front, frontStyle: "title",
    reason: "単元練習",
    answer: rubric ? { type: "self-evaluation", rubric, placeholder: "自分の言葉で1〜3文（表現は自由です）" } : revision.answerSpec,
    answerRows: rubric ? [] : [
      { label: "正解", value: revision.answerSpec.acceptedAnswers[0] },
      { label: "解説", value: revision.explanation.summary },
    ],
    sourceUrl: entry.scopeSubjectUrl,
    ...(asset ? { asset: asReviewAsset(asset) } : {}),
    ...(comparisonAssets.length ? { comparisonAssets } : {}),
    persistenceKind: "versioned-pilot", instanceId: instance.instance_id,
  };
}
