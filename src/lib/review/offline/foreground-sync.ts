import { recoverSendingOfflineAttempts } from "./attempt-outbox.ts";
import { flushPilotAttemptOutbox } from "./pilot-transport.ts";

type ForegroundFlushResult = Awaited<ReturnType<typeof flushPilotAttemptOutbox>>;

let inFlight: Promise<ForegroundFlushResult> | null = null;

/**
 * Shared foreground recovery used by both ReviewSession and the cold-start
 * shell. It never creates an attempt and never sends from a service worker.
 * Concurrent tabs coalesce the local flush while server idempotency remains
 * the final duplicate-delivery guard.
 */
export function recoverAndFlushPilotOutbox(): Promise<ForegroundFlushResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    await recoverSendingOfflineAttempts();
    return flushPilotAttemptOutbox({ receiptKind: "objective" });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
