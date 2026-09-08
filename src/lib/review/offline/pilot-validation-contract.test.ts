import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { validatePilotAttemptInput } from "../pilot-attempt-contract.ts";
import { hashExerciseAttemptRequest } from "../exercises/attempt.ts";
import { hashExerciseAttemptRequestBrowser } from "../exercises/attempt-browser.ts";
import {
  createOfflineAttemptDraft,
  createOfflineSubmission,
  type OfflineAttemptCommitted,
} from "./model-core.ts";
import { requestBody } from "./pilot-transport.ts";
import { transitionOfflineAttempt } from "./outbox-core.ts";
import type { PersistedOfflineAttempt } from "./attempt-outbox.ts";

const attemptId = "11111111-1111-4111-8111-111111111111";
const productionInstanceId = "642c022c-0606-496a-998b-a6ef115c1618";
const browserCrypto = webcrypto as unknown as Pick<Crypto, "subtle">;

function persisted(
  grade: "again" | "hard" | "good" | "easy",
  responseMs: number | null,
  metadata = false,
): PersistedOfflineAttempt {
  const submission = createOfflineSubmission({
    attemptId,
    instanceId: productionInstanceId,
    rawAnswer: "あ",
    selfEvaluation: grade,
    responseMs,
    usedHint: false,
    ...(metadata ? {
      clientAnsweredAt: "2030-01-01T00:00:00.000Z",
      clientSnapshotId: "snapshot-1",
      clientSnapshotGeneration: 1,
    } : {}),
  });
  const committed = transitionOfflineAttempt(createOfflineAttemptDraft(), {
    type: "confirm-submission",
    submission,
    requestHash: hashExerciseAttemptRequest(submission),
  }) as OfflineAttemptCommitted;
  return {
    attemptId,
    instanceId: productionInstanceId,
    record: committed,
    transport: {
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
      lastAttemptedAt: null,
      retryCount: 0,
      lastTransportError: null,
    },
  };
}

function asWire(record: PersistedOfflineAttempt) {
  return JSON.parse(JSON.stringify(requestBody(record))) as Record<string, unknown>;
}

test("actual offline pilot wire tuple is accepted for every grade", () => {
  for (const grade of ["again", "hard", "good", "easy"] as const) {
    const parsed = validatePilotAttemptInput(asWire(persisted(grade, 1200)));
    assert.equal(parsed.ok, true, `${grade} should satisfy the server validator`);
    if (parsed.ok) {
      assert.equal(parsed.request.attemptId, attemptId);
      assert.equal(parsed.request.instanceId, productionInstanceId);
      assert.equal(parsed.request.rawAnswer, "あ");
      assert.equal(parsed.request.selfEvaluation, grade);
      assert.equal(parsed.request.responseMs, 1200);
      assert.equal(parsed.request.usedHint, false);
    }
  }
});

test("null responseMs and structured-cloned pending recovery remain valid wire payloads", () => {
  const sending = persisted("good", null);
  const recovered = {
    ...sending,
    record: transitionOfflineAttempt(
      transitionOfflineAttempt(sending.record, { type: "begin-send" }),
      { type: "crash-recovered" },
    ) as OfflineAttemptCommitted,
  } satisfies PersistedOfflineAttempt;
  const cloned = structuredClone(recovered);
  const parsed = validatePilotAttemptInput(asWire(cloned));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.request.responseMs, null);
  assert.equal(recovered.record.status, "pending");
});

test("JSON roundtrip excludes client metadata and preserves request hash parity", async () => {
  const record = persisted("good", 1200, true);
  const body = asWire(structuredClone(record));
  assert.deepEqual(Object.keys(body).sort(), [
    "attemptId",
    "instanceId",
    "rawAnswer",
    "responseMs",
    "selfEvaluation",
    "usedHint",
  ]);
  assert.equal("clientAnsweredAt" in body, false);
  assert.equal("clientSnapshotId" in body, false);
  assert.equal("clientSnapshotGeneration" in body, false);
  assert.equal(validatePilotAttemptInput(body).ok, true);

  const serverHash = hashExerciseAttemptRequest({
    attemptId,
    instanceId: productionInstanceId,
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
  });
  const browserHash = await hashExerciseAttemptRequestBrowser({
    attemptId,
    instanceId: productionInstanceId,
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
  }, browserCrypto);
  assert.equal(record.record.requestHash, serverHash);
  assert.equal(browserHash, serverHash);
});
