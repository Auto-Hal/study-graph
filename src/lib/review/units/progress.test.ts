import assert from "node:assert/strict";
import { test } from "node:test";
import { unitProgressFromOutbox } from "./progress.ts";
import type { ReviewCard } from "../types.ts";
import type { PersistedOfflineAttempt } from "../offline/attempt-outbox.ts";

const cards = ["first", "second", "third"].map((id) => ({ id, instanceId: id })) as ReviewCard[];
function committed(instanceId: string, status = "pending"): PersistedOfflineAttempt {
  return { instanceId, attemptId: "attempt-" + instanceId, record: { status,
    submission: { instanceId, attemptId: "attempt-" + instanceId, rawAnswer: "言い換えた回答", selfEvaluation: "good" } } } as unknown as PersistedOfflineAttempt;
}

test("resume uses durable commitments, including pending transport, without guessing correctness", () => {
  const results = unitProgressFromOutbox(cards, [committed("second", "blocked"), committed("first")]);
  assert.equal(results.length, 2);
  assert.equal(results[0].attemptId, "attempt-first");
  assert.equal(results[0].syncStatus, "pending");
  assert.equal(results[0].correct, null);
  assert.equal(results[1].syncStatus, "blocked");
});

test("resume does not skip gaps or mix another run's submissions", () => {
  assert.equal(unitProgressFromOutbox(cards, [committed("second")]).length, 0);
  assert.equal(unitProgressFromOutbox(cards, [committed("first"), committed("unrelated")]).length, 1);
  const invalid = structuredClone(committed("first"));
  (invalid.record.submission as unknown as Record<string, unknown>).instanceId = "other";
  assert.equal(unitProgressFromOutbox(cards, [invalid]).length, 0);
});
