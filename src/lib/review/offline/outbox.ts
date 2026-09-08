import { hashExerciseAttemptRequest } from "../exercises/attempt.ts";
import {
  confirmOfflineSubmissionWithHash,
  createOfflineSubmission,
  type OfflineAttemptDraft,
  type OfflineSubmissionInput,
} from "./model.ts";
import { transitionOfflineAttempt as transitionCore, type OfflineAttemptEvent, type OfflineAttemptRecord } from "./outbox-core.ts";

/**
 * Compatibility entrypoint for existing server/tests. Browser transport uses
 * outbox-core.ts so this synchronous Node hash facade never enters its bundle.
 */
export * from "./outbox-core.ts";

/**
 * Keep the original synchronous transition API for server callers. The
 * browser core requires an already computed Web Crypto hash; this facade can
 * supply the unchanged server hash when an older caller confirms a draft
 * without passing one explicitly.
 */
export function transitionOfflineAttempt(
  record: OfflineAttemptRecord,
  event: OfflineAttemptEvent,
): OfflineAttemptRecord {
  if (record.status === "draft" && event.type === "confirm-submission" && !event.requestHash) {
    const submission = createOfflineSubmission(event.submission);
    return transitionCore(record, {
      ...event,
      requestHash: hashExerciseAttemptRequest({
        attemptId: submission.attemptId,
        instanceId: submission.instanceId,
        rawAnswer: submission.rawAnswer,
        selfEvaluation: submission.selfEvaluation,
        responseMs: submission.responseMs,
        usedHint: submission.usedHint,
      }),
    });
  }
  return transitionCore(record, event);
}

/** Preserve the Phase 4E-1 synchronous server helper and hash authority. */
export function confirmOfflineSubmission(
  draft: OfflineAttemptDraft,
  input: OfflineSubmissionInput,
) {
  const submission = createOfflineSubmission(input);
  return confirmOfflineSubmissionWithHash(
    draft,
    input,
    hashExerciseAttemptRequest({
      attemptId: submission.attemptId,
      instanceId: submission.instanceId,
      rawAnswer: submission.rawAnswer,
      selfEvaluation: submission.selfEvaluation,
      responseMs: submission.responseMs,
      usedHint: submission.usedHint,
    }),
  );
}
