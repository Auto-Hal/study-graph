import { authoritativeReceiptResult } from "./model-core.ts";
import type { PersistedOfflineAttempt } from "./attempt-outbox.ts";

export type PilotSessionResult = Readonly<{
  id: string;
  grade: "again" | "hard" | "good" | "easy";
  saved: boolean;
  dueAt: string | null;
  correct: boolean | null;
  srsApplied?: boolean;
  syncStatus?: "accepted" | "pending" | "auth-required" | "blocked";
  /** The immutable outbox identity used to reconcile later transport changes. */
  attemptId?: string;
}>;

/**
 * Reconcile one historical UI result with the current durable outbox record.
 * Result.syncStatus describes the state observed when the answer was made;
 * this helper deliberately treats the outbox and its stored receipt as the
 * current authority after a foreground/background flush.
 */
export function reconcilePilotResult(
  result: PilotSessionResult,
  current: PersistedOfflineAttempt | null | undefined,
): PilotSessionResult {
  if (!result.attemptId || !current || current.attemptId !== result.attemptId) return result;
  if (current.record.submission.attemptId !== result.attemptId) return result;

  switch (current.record.status) {
    case "pending":
    case "sending":
      return { ...result, saved: false, syncStatus: "pending", dueAt: null };
    case "auth-required":
      return { ...result, saved: false, syncStatus: "auth-required", dueAt: null };
    case "blocked":
      return { ...result, saved: false, syncStatus: "blocked", dueAt: null };
    case "accepted-applied":
    case "accepted-no-srs": {
      try {
        if (!current.record.receipt) throw new Error("stored_receipt_incomplete");
        const receipt = authoritativeReceiptResult(current.record.receipt, current.instanceId);
        if (receipt.attemptId !== result.attemptId) throw new Error("stored_receipt_attempt_mismatch");
        return {
          ...result,
          saved: true,
          syncStatus: "accepted",
          dueAt: receipt.dueAt,
          correct: receipt.isCorrect,
          srsApplied: receipt.srsApplied,
        };
      } catch {
        // A malformed terminal record must never be presented as server
        // accepted. Keep the durable submission and expose a review-needed
        // state without attempting to reconstruct the receipt.
        return {
          ...result,
          saved: false,
          syncStatus: "blocked",
          dueAt: null,
          srsApplied: undefined,
        };
      }
    }
  }
}

/** Reconcile every result for which the durable outbox has a matching record. */
export function reconcilePilotResults(
  results: readonly PilotSessionResult[],
  records: readonly PersistedOfflineAttempt[],
): PilotSessionResult[] {
  const byAttempt = new Map(records.map((record) => [record.attemptId, record]));
  return results.map((result) => reconcilePilotResult(result, byAttempt.get(result.attemptId ?? "")));
}
