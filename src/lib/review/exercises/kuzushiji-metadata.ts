import type { ExerciseRevisionMetadata } from "./revision.ts";

export const KUZUSHIJI_PILOT_PROJECT_ID = "kuzushiji" as const;
export const KUZUSHIJI_PILOT_EXERCISE_ID = "kuzushiji.visual-reading.eitaigura-u3042-00032-1" as const;

export function isProtectedKuzushijiPilotIdentity(projectId: string, exerciseId: string) {
  return projectId === KUZUSHIJI_PILOT_PROJECT_ID && exerciseId === KUZUSHIJI_PILOT_EXERCISE_ID;
}

/**
 * Keep the historical provenance assertion at the generic revision boundary.
 * This prevents callers from bypassing it by calling the generic builder.
 */
export function assertExerciseRevisionMetadata(
  projectId: string,
  exerciseId: string,
  metadata: ExerciseRevisionMetadata,
) {
  if (!isProtectedKuzushijiPilotIdentity(projectId, exerciseId)) {
    if (metadata !== null) throw new Error("non-Kuzushiji revisions require pilotMetadata to be null");
    return;
  }

  if (!metadata || typeof metadata !== "object" || !metadata.motherCharacter) {
    throw new Error("Kuzushiji pilot metadata is required");
  }
  if (metadata.motherCharacter.value !== "阿") {
    throw new Error("Kuzushiji pilot motherCharacter must remain 阿");
  }
  if (metadata.motherCharacter.status !== "legacy-approved") {
    throw new Error("Kuzushiji pilot motherCharacter must remain legacy-approved");
  }
  if (metadata.motherCharacter.approvedFrom !== "PR #27") {
    throw new Error("Kuzushiji pilot motherCharacter must remain approved from PR #27");
  }
}
