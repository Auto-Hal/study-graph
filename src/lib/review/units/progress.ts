import type { ReviewCard } from "../types.ts";
import type { PersistedOfflineAttempt } from "../offline/attempt-outbox.ts";
import { reconcilePilotResult, type PilotSessionResult } from "../offline/result-reconciliation.ts";

/** Only committed outbox submissions advance progress, including answers waiting for transport. */
export function unitProgressFromOutbox(cards: readonly ReviewCard[], records: readonly PersistedOfflineAttempt[]) {
  const byInstance = new Map(records.map((record) => [record.instanceId, record]));
  const results: PilotSessionResult[] = [];
  for (const card of cards) {
    const record = byInstance.get(card.instanceId ?? "");
    if (!record) break;
    const submission = record.record.submission;
    if (submission.instanceId !== card.instanceId || submission.attemptId !== record.attemptId
      || !submission.selfEvaluation || typeof submission.rawAnswer !== "string") break;
    results.push(reconcilePilotResult({ id: card.id, attemptId: record.attemptId,
      grade: submission.selfEvaluation, saved: false, dueAt: null, correct: null }, record));
  }
  return results;
}
