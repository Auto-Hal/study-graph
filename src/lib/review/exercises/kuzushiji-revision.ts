import {
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
  type ExerciseRevision,
  type ExerciseRevisionPayload,
  type ContentRelease,
  type ContentReleaseManifest,
} from "./revision.ts";
import {
  kuzushijiPilotAssets,
  kuzushijiPilotRecord,
  kuzushijiPilotV2Assets,
  kuzushijiPilotV2Record,
} from "./kuzushiji-pilot.ts";

export const kuzushijiPilotRevision: ExerciseRevision = createExerciseRevision(
  kuzushijiPilotRecord.exercise,
  kuzushijiPilotAssets,
  kuzushijiPilotRecord.metadata,
);

export const kuzushijiPilotRevisionPayload: ExerciseRevisionPayload = getExerciseRevisionPayload(kuzushijiPilotRevision);

export const kuzushijiPilotContentReleaseManifest: ContentReleaseManifest = createContentReleaseManifest([
  kuzushijiPilotRevision,
]);

export const kuzushijiPilotContentRelease: ContentRelease = createContentRelease(
  kuzushijiPilotContentReleaseManifest,
);

/**
 * Version 2 keeps the pilot's learning semantics byte-for-byte equivalent
 * while pinning the measured asset checksum for offline verification.  The
 * v1 revision/release above remains immutable historical content.
 */
export const kuzushijiPilotRevisionV2: ExerciseRevision = createExerciseRevision(
  kuzushijiPilotV2Record.exercise,
  kuzushijiPilotV2Assets,
  kuzushijiPilotV2Record.metadata,
  {
    supersedes: `${kuzushijiPilotV2Record.exercise.exerciseId}:v1`,
    changeReason: "Pin the repository asset checksum for Phase 4E-5 offline verification",
  },
);

export const kuzushijiPilotRevisionV2Payload: ExerciseRevisionPayload = getExerciseRevisionPayload(kuzushijiPilotRevisionV2);

export const kuzushijiPilotContentReleaseManifestV2: ContentReleaseManifest = createContentReleaseManifest([
  kuzushijiPilotRevisionV2,
]);

export const kuzushijiPilotContentReleaseV2: ContentRelease = createContentRelease(
  kuzushijiPilotContentReleaseManifestV2,
);
