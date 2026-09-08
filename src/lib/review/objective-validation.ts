/**
 * Browser-safe Objective SRS generation validation.  Keep this small module
 * free of the server-only Objective hashing implementation so offline models
 * can validate epoch/key data without pulling node:crypto into the client.
 */
export type SrsEpoch = number;

export const INITIAL_SRS_EPOCH: SrsEpoch = 1;

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
