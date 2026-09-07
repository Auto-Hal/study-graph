import {
  canonicalizeJson,
  sha256Hex,
} from "./exercises/revision.ts";

export type ObjectiveResponseMode = "recognition" | "recall" | "production";

/** SRS generation number. It is deliberately validated at runtime. */
export type SrsEpoch = number;

export const INITIAL_SRS_EPOCH: SrsEpoch = 1;

export type ObjectiveSupersedes = {
  objectiveId: string;
  objectiveVersion: number;
};

/**
 * An Objective is an evaluable capability, not an exercise category or a
 * mastery claim. Response direction, mode, conditions, and success criterion
 * are part of its meaning.
 */
export type ObjectiveDefinition = {
  projectId: string;
  objectiveId: string;
  objectiveVersion: number;

  title: string;
  target: string;
  action: string;
  responseMode: ObjectiveResponseMode;
  conditions: string;
  successCriterion: string;

  supersedes?: ObjectiveSupersedes;
  changeReason?: string;
};

/** The active SRS generation is carried beside the semantic definition. */
export type ObjectiveDefinitionRecord = ObjectiveDefinition & {
  srsEpoch: SrsEpoch;
};

export type ExerciseObjectiveBinding = {
  revisionId: string;
  objectiveId: string;
  objectiveVersion: number;
  evidenceUse: "srs" | "practice-only";
};

const RESPONSE_MODES: readonly ObjectiveResponseMode[] = ["recognition", "recall", "production"];
const EVIDENCE_USES = ["srs", "practice-only"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateSrsEpoch(value: unknown): string[] {
  return isPositiveInteger(value) ? [] : ["srsEpoch must be a positive integer"];
}

export function assertValidSrsEpoch(value: unknown): asserts value is SrsEpoch {
  const errors = validateSrsEpoch(value);
  if (errors.length > 0) throw new Error(errors.join("; "));
}

export function validateObjectiveDefinition(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["objective definition must be an object"];

  for (const field of ["projectId", "objectiveId", "title", "target", "action", "conditions", "successCriterion"]) {
    if (!isNonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  if (!isPositiveInteger(value.objectiveVersion)) errors.push("objectiveVersion must be a positive integer");
  if (!RESPONSE_MODES.includes(value.responseMode as ObjectiveResponseMode)) {
    errors.push("responseMode is invalid");
  }

  if (hasOwn(value, "srsEpoch")) errors.push(...validateSrsEpoch(value.srsEpoch));

  if (hasOwn(value, "supersedes")) {
    if (!isRecord(value.supersedes)) {
      errors.push("supersedes must be an object");
    } else {
      if (!isNonEmptyString(value.supersedes.objectiveId)) errors.push("supersedes.objectiveId is required");
      if (!isPositiveInteger(value.supersedes.objectiveVersion)) {
        errors.push("supersedes.objectiveVersion must be a positive integer");
      }
      if (
        isNonEmptyString(value.objectiveId)
        && isPositiveInteger(value.objectiveVersion)
        && value.supersedes.objectiveId === value.objectiveId
        && value.supersedes.objectiveVersion === value.objectiveVersion
      ) {
        errors.push("objective cannot supersede itself");
      }
    }
  }

  if (hasOwn(value, "changeReason") && value.changeReason !== undefined && !isNonEmptyString(value.changeReason)) {
    errors.push("changeReason must be a non-empty string when provided");
  }
  return errors;
}

export function validateObjectiveDefinitionRecord(value: unknown): string[] {
  const errors = validateObjectiveDefinition(value);
  if (!isRecord(value) || !hasOwn(value, "srsEpoch")) errors.push("srsEpoch is required");
  return errors;
}

export function assertValidObjectiveDefinition(value: unknown): asserts value is ObjectiveDefinition {
  const errors = validateObjectiveDefinition(value);
  if (errors.length > 0) throw new Error("Invalid objective definition: " + errors.join("; "));
}

export function assertValidObjectiveDefinitionRecord(value: unknown): asserts value is ObjectiveDefinitionRecord {
  const errors = validateObjectiveDefinitionRecord(value);
  if (errors.length > 0) throw new Error("Invalid objective definition record: " + errors.join("; "));
}

export function validateExerciseObjectiveBinding(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["exercise objective binding must be an object"];
  if (!isNonEmptyString(value.revisionId)) errors.push("revisionId is required");
  if (!isNonEmptyString(value.objectiveId)) errors.push("objectiveId is required");
  if (!isPositiveInteger(value.objectiveVersion)) errors.push("objectiveVersion must be a positive integer");
  if (!EVIDENCE_USES.includes(value.evidenceUse as (typeof EVIDENCE_USES)[number])) {
    errors.push("evidenceUse is invalid");
  }
  return errors;
}

export function assertValidExerciseObjectiveBinding(value: unknown): asserts value is ExerciseObjectiveBinding {
  const errors = validateExerciseObjectiveBinding(value);
  if (errors.length > 0) throw new Error("Invalid exercise objective binding: " + errors.join("; "));
}

/** A revision can have at most one Objective binding in Phase 4D. */
export function validateExerciseObjectiveBindings(value: unknown): string[] {
  if (!Array.isArray(value)) return ["exercise objective bindings must be an array"];
  const errors: string[] = [];
  const revisionIds = new Set<string>();
  for (const [index, binding] of value.entries()) {
    const bindingErrors = validateExerciseObjectiveBinding(binding);
    errors.push(...bindingErrors.map((error) => `bindings[${index}].${error}`));
    if (isRecord(binding) && isNonEmptyString(binding.revisionId)) {
      if (revisionIds.has(binding.revisionId)) errors.push(`bindings[${index}].revisionId has multiple Objective bindings`);
      revisionIds.add(binding.revisionId);
    }
  }
  return errors;
}

export function assertValidExerciseObjectiveBindings(value: unknown): asserts value is ExerciseObjectiveBinding[] {
  const errors = validateExerciseObjectiveBindings(value);
  if (errors.length > 0) throw new Error("Invalid exercise objective bindings: " + errors.join("; "));
}

/**
 * Objective hashes reuse the Phase 4C canonical JSON rules without changing
 * ExerciseRevision or ContentRelease hashing. Object keys are sorted, arrays
 * retain order, and strings are left unchanged.
 */
export function canonicalizeObjectiveDefinition(value: ObjectiveDefinition | ObjectiveDefinitionRecord) {
  if ("srsEpoch" in value) assertValidObjectiveDefinitionRecord(value);
  else assertValidObjectiveDefinition(value);
  return canonicalizeJson(value);
}

export function hashObjectiveDefinition(value: ObjectiveDefinition | ObjectiveDefinitionRecord) {
  return sha256Hex(canonicalizeObjectiveDefinition(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

/** Copy and freeze a Git-owned Objective record at its content boundary. */
export function freezeObjectiveDefinition<T extends ObjectiveDefinition>(value: T): T {
  const canonical = canonicalizeObjectiveDefinition(value);
  return deepFreeze(JSON.parse(canonical) as T);
}
