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
import { kuzushijiPilotAssets, kuzushijiPilotRecord } from "./kuzushiji-pilot.ts";

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
