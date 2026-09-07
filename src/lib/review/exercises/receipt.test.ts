import assert from "node:assert/strict";
import test from "node:test";
import {
  resultFromStoredObjectiveReceipt,
  resultFromStoredReceipt,
  StoredReceiptIncompleteError,
} from "./receipt.ts";

const instanceId = "22222222-2222-4222-8222-222222222222";

function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receiptVersion: 1,
    attemptId: "11111111-1111-4111-8111-111111111111",
    instanceId,
    acceptedAt: "2030-01-01T00:00:00.000Z",
    gradingStatus: "graded",
    isCorrect: true,
    effectiveSrsGrade: "good",
    srsApplied: true,
    srsReason: "applied",
    legacyReviewAttemptId: 42,
    reviewStateBefore: null,
    reviewStateAfter: { due_at: "2030-01-03T00:00:00.000Z" },
    ...overrides,
  };
}

function objectiveReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receiptVersion: 1,
    attemptId: "11111111-1111-4111-8111-111111111111",
    instanceId,
    acceptedAt: "2030-01-01T00:00:00.000Z",
    projectId: "kuzushiji",
    objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
    objectiveVersion: 1,
    srsEpoch: 1,
    evidenceUse: "srs",
    gradingStatus: "graded",
    isCorrect: true,
    applied: true,
    reason: "applied",
    effectiveGrade: "good",
    stateRevision: 1,
    dueAt: "2030-01-03T00:00:00.000Z",
    ...overrides,
  };
}

test("receipt restoration uses stored authority fields", () => {
  const result = resultFromStoredReceipt(receipt(), instanceId);
  assert.equal(result.isCorrect, true);
  assert.equal(result.effectiveSrsGrade, "good");
  assert.equal(result.srsApplied, true);
  assert.equal(result.srsReason, "applied");
  assert.equal(result.dueAt, "2030-01-03T00:00:00.000Z");
  assert.equal(result.normalizedAnswer, null);
});

test("incomplete receipt fails closed instead of accepting current grading", () => {
  for (const missing of ["isCorrect", "effectiveSrsGrade", "srsApplied", "srsReason", "reviewStateBefore"]) {
    const value = receipt();
    delete value[missing];
    assert.throws(() => resultFromStoredReceipt(value, instanceId), StoredReceiptIncompleteError);
  }
});

test("receipt from another instance is not restorable", () => {
  assert.throws(
    () => resultFromStoredReceipt(receipt({ instanceId: "33333333-3333-4333-8333-333333333333" }), instanceId),
    StoredReceiptIncompleteError,
  );
});

test("Objective receipt restoration preserves accepted SRS authority", () => {
  const result = resultFromStoredObjectiveReceipt(objectiveReceipt(), instanceId);
  assert.equal(result.isCorrect, true);
  assert.equal(result.effectiveSrsGrade, "good");
  assert.equal(result.srsApplied, true);
  assert.equal(result.srsReason, "applied");
  assert.equal(result.dueAt, "2030-01-03T00:00:00.000Z");
});

test("Objective no-SRS receipt restores without fabricating state", () => {
  const result = resultFromStoredObjectiveReceipt(objectiveReceipt({
    applied: false,
    reason: "scope-not-eligible",
    effectiveGrade: null,
    stateRevision: null,
    dueAt: null,
  }), instanceId);
  assert.equal(result.srsApplied, false);
  assert.equal(result.srsReason, "scope-not-eligible");
  assert.equal(result.dueAt, null);
});

test("Objective receipt fails closed when application authority is incomplete", () => {
  for (const missing of ["objectiveId", "srsEpoch", "applied", "reason", "stateRevision", "dueAt"]) {
    const value = objectiveReceipt();
    delete value[missing];
    assert.throws(() => resultFromStoredObjectiveReceipt(value, instanceId), StoredReceiptIncompleteError);
  }
  assert.throws(
    () => resultFromStoredObjectiveReceipt(objectiveReceipt({ applied: false, reason: "applied" }), instanceId),
    StoredReceiptIncompleteError,
  );
});
