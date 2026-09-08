import assert from "node:assert/strict";
import test from "node:test";
import { describeOfflineAttempt, diagnosticValidationRequestBody } from "./attempt-diagnostics.ts";
import { createOfflineAttemptDraft, createOfflineSubmission } from "./model-core.ts";
import { transitionOfflineAttempt } from "./outbox-core.ts";
import type { PersistedOfflineAttempt } from "./attempt-outbox.ts";

const attemptId = "11111111-1111-4111-8111-111111111111";
const instanceId = "642c022c-0606-496a-998b-a6ef115c1618";

function blockedRecord(): PersistedOfflineAttempt {
  const submission = createOfflineSubmission({
    attemptId,
    instanceId,
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
  });
  const record = transitionOfflineAttempt(createOfflineAttemptDraft(), {
    type: "confirm-submission",
    submission,
    requestHash: "a".repeat(64),
  });
  const sending = transitionOfflineAttempt(record, { type: "begin-send" });
  const blocked = transitionOfflineAttempt(sending, { type: "blocked", reason: "malformed-response" });
  return {
    attemptId,
    instanceId,
    record: blocked,
    transport: {
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:01:00.000Z",
      lastAttemptedAt: "2030-01-01T00:01:00.000Z",
      retryCount: 1,
      lastTransportError: "malformed-response",
      lastHttpStatus: 400,
      lastServerErrorCode: "invalid_response_ms",
      lastTransportObservedAt: "2030-01-01T00:01:00.000Z",
    },
  } as PersistedOfflineAttempt;
}

test("blocked diagnostics expose structure without answer content", () => {
  const record = blockedRecord();
  const before = JSON.stringify(record);
  const diagnostic = describeOfflineAttempt(record);
  assert.equal(diagnostic.status, "blocked");
  assert.equal(diagnostic.blockedReason, "malformed-response");
  assert.equal(diagnostic.lastHttpStatus, 400);
  assert.equal(diagnostic.lastServerErrorCode, "invalid_response_ms");
  assert.equal(diagnostic.attemptIdValid, true);
  assert.equal(diagnostic.instanceId, instanceId);
  assert.equal(diagnostic.rawAnswerType, "string");
  assert.equal(diagnostic.rawAnswerStringLength, 1);
  assert.equal(diagnostic.selfEvaluation, "good");
  assert.equal(diagnostic.responseMsType, "number");
  assert.equal(diagnostic.responseMsValue, 1200);
  assert.equal(diagnostic.usedHintType, "boolean");
  assert.equal(diagnostic.usedHintValue, false);
  assert.equal(diagnostic.retryCount, 1);
  assert.equal("rawAnswer" in diagnostic, false);
  assert.equal(JSON.stringify(record), before);
});

test("diagnostic validation body is exactly the immutable six-field tuple", () => {
  const record = blockedRecord();
  const body = diagnosticValidationRequestBody(record);
  assert.deepEqual(Object.keys(body).sort(), [
    "attemptId",
    "instanceId",
    "rawAnswer",
    "responseMs",
    "selfEvaluation",
    "usedHint",
  ]);
  assert.equal(JSON.stringify(body).includes("lastServerErrorCode"), false);
  assert.equal(JSON.stringify(body).includes("clientAnsweredAt"), false);
});
