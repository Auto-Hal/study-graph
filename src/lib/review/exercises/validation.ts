import type { ExerciseDefinition, ExerciseSource, VisualAsset } from "./types";

function validateSource(source: ExerciseSource, index: number) {
  const errors: string[] = [];
  const prefix = `sources[${index}]`;
  if (!source || typeof source !== "object" || Array.isArray(source)) return [`${prefix} is invalid`];
  const candidate = source as Record<string, unknown>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) errors.push(`${prefix}.title is required`);
  if (typeof candidate.url !== "string" || !candidate.url.trim()) errors.push(`${prefix}.url is required`);
  if (typeof candidate.attribution !== "string" || !candidate.attribution.trim()) errors.push(`${prefix}.attribution is required`);
  if (Object.prototype.hasOwnProperty.call(candidate, "kind")) {
    if (candidate.kind !== "text-reference") errors.push(`${prefix}.kind is invalid`);
    if (Object.prototype.hasOwnProperty.call(candidate, "license")) errors.push(`${prefix}.license is invalid for text-reference`);
  } else if (typeof candidate.license !== "string" || !candidate.license.trim()) {
    errors.push(`${prefix}.license is required`);
  }
  return errors;
}

export function validateExerciseDefinition(
  definition: ExerciseDefinition,
  assets: ReadonlyMap<string, VisualAsset>,
): string[] {
  const errors: string[] = [];

  if (definition.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!definition.exerciseId.trim()) errors.push("exerciseId is required");
  if (/:v\d+$/.test(definition.exerciseId)) errors.push("exerciseId must not contain a version suffix");
  if (!Number.isInteger(definition.exerciseVersion) || definition.exerciseVersion < 1) {
    errors.push("exerciseVersion must be a positive integer");
  }
  for (const [field, value] of Object.entries({
    projectId: definition.projectId,
    domain: definition.domain,
    objectiveId: definition.objectiveId,
    skill: definition.skill,
    category: definition.category,
    prompt: definition.prompt,
    front: definition.front,
    explanation: definition.explanation.summary,
  })) {
    if (!value.trim()) errors.push(field + " is required");
  }

  const rubric = definition.explanation.rubric;
  const selfEvaluated = definition.gradingSpec.strategyId === "rubric-self-evaluation-v1";
  if (definition.answerSpec.type !== "text" || (!selfEvaluated && definition.answerSpec.acceptedAnswers.length === 0)) {
    errors.push("a non-empty text answerSpec is required");
  }
  if (selfEvaluated) {
    if (definition.answerSpec.acceptedAnswers.length !== 0) errors.push("rubric must not use exact-match answers");
    if (!rubric || typeof rubric.modelAnswer !== "string" || !rubric.modelAnswer.trim()
      || ![rubric.requiredPoints, rubric.allowedParaphrases, rubric.majorMisconceptions].every((list) =>
        Array.isArray(list) && list.length > 0 && list.every((point) => typeof point === "string" && point.trim()))) {
      errors.push("a complete self-evaluation rubric is required");
    }
  } else if (rubric !== undefined) errors.push("rubric requires the self-evaluation strategy");
  if (!["legacy-text-v1", "rubric-self-evaluation-v1"].includes(definition.gradingSpec.strategyId)
    || definition.gradingSpec.strategyVersion !== 1 || definition.gradingSpec.normalization !== "review-session-ja-v1") {
    errors.push("unsupported grading strategy");
  }
  if (definition.origin !== "curated") errors.push("pilot must be curated");
  if (definition.status !== "approved") errors.push("pilot must be approved");
  if (definition.sources.length === 0) errors.push("at least one source is required");
  definition.sources.forEach((source, index) => errors.push(...validateSource(source, index)));

  for (const stimulus of definition.stimuli) {
    const asset = assets.get(stimulus.assetId);
    if (!asset) {
      errors.push("missing asset: " + stimulus.assetId);
      continue;
    }
    if (asset.assetVersion !== stimulus.assetVersion) {
      errors.push("asset version mismatch: " + stimulus.assetId);
    }
    if (!asset.src.trim()) errors.push("asset src is required: " + stimulus.assetId);
    if (!asset.alt.trim()) errors.push("asset alt is required: " + stimulus.assetId);
    if (!Number.isInteger(asset.width) || asset.width <= 0) errors.push("asset width is invalid: " + stimulus.assetId);
    if (!Number.isInteger(asset.height) || asset.height <= 0) errors.push("asset height is invalid: " + stimulus.assetId);
    const source = asset.source as Record<string, unknown>;
    if (source.kind !== undefined || typeof source.license !== "string") {
      errors.push("asset source must be a licensed source: " + stimulus.assetId);
    } else if (
      typeof source.title !== "string" || !source.title.trim()
      || typeof source.url !== "string" || !source.url.trim()
      || typeof source.attribution !== "string" || !source.attribution.trim()
      || !source.license.trim()
    ) {
      errors.push("asset source metadata is incomplete: " + stimulus.assetId);
    }
    if (!Object.prototype.hasOwnProperty.call(asset, "checksum")) {
      errors.push("asset checksum field is required: " + stimulus.assetId);
    }
  }

  return errors;
}

export function assertValidExerciseDefinition(
  definition: ExerciseDefinition,
  assets: ReadonlyMap<string, VisualAsset>,
) {
  const errors = validateExerciseDefinition(definition, assets);
  if (errors.length > 0) throw new Error("Invalid exercise definition: " + errors.join("; "));
}
