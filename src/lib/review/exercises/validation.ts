import type { ExerciseDefinition, VisualAsset } from "./types";

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

  if (definition.answerSpec.type !== "text" || definition.answerSpec.acceptedAnswers.length === 0) {
    errors.push("a non-empty text answerSpec is required");
  }
  if (definition.gradingSpec.strategyId !== "legacy-text-v1" || definition.gradingSpec.strategyVersion !== 1) {
    errors.push("unsupported grading strategy");
  }
  if (definition.origin !== "curated") errors.push("pilot must be curated");
  if (definition.status !== "approved") errors.push("pilot must be approved");
  if (definition.sources.length === 0) errors.push("at least one source is required");

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
    if (!asset.source.title.trim() || !asset.source.url.trim() || !asset.source.attribution.trim() || !asset.source.license.trim()) {
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
