import { hashExerciseAttemptRequest } from "../exercises/attempt.ts";
import {
  confirmOfflineSubmissionWithHash,
  createOfflineSubmission as createCoreOfflineSubmission,
  hashOfflineSubmissionWith,
  type OfflineAttemptDraft,
  type OfflineSubmission,
  type OfflineSubmissionInput,
} from "./model-core.ts";

/**
 * Server compatibility facade for the Phase 4E offline model. The model
 * itself lives in model-core.ts so browser code never imports Node crypto.
 * Existing server/test exports remain unchanged.
 */
export * from "./model-core.ts";

/** Hash authority remains exactly the existing Phase 4C request tuple. */
export function hashOfflineSubmission(submission: OfflineSubmission): string {
  return hashOfflineSubmissionWith(submission, (input) => hashExerciseAttemptRequest(input));
}

export function confirmOfflineSubmission(
  draft: OfflineAttemptDraft,
  input: OfflineSubmissionInput,
) {
  const submission = createCoreOfflineSubmission(input);
  return confirmOfflineSubmissionWithHash(draft, input, hashOfflineSubmission(submission));
}
