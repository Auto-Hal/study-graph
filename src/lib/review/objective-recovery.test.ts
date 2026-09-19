import assert from "node:assert/strict";
import test from "node:test";
import {
  ObjectiveRecoveryContractError,
  opportunityOwnsActiveInstance,
  readObjectiveOpportunityLifecycle,
  readObjectiveSchedulingContext,
  recoverObjectiveReceipt,
  restoreObjectiveOfflineReceiptForRecovery,
  restoreObjectiveReceiptForRecovery,
} from "./objective-recovery.ts";
import {
  authoritativeReceiptResult,
  createOfflineReceiptRecord,
} from "./offline/model-core.ts";

const attemptId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";

function objectiveReceipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptVersion: 2,
    attemptId,
    instanceId,
    acceptedAt: "2030-01-01T00:00:00.000Z",
    projectId: "philosophy",
    objectiveId: "philosophy.term-recall",
    objectiveVersion: 1,
    srsEpoch: 1,
    evidenceUse: "srs",
    gradingStatus: "graded",
    isCorrect: true,
    applied: true,
    reason: "applied",
    effectiveGrade: "good",
    stateRevision: 3,
    dueAt: "2030-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function historicalContext() {
  return {
    schedulingContextVersion: null,
    opportunityKind: null,
    effectiveEvidenceUse: null,
    expectedStateRevision: null,
    gradePolicyVersion: null,
    activationPolicyVersion: null,
    issuedAt: null,
    expiresAt: null,
    dueAtObserved: null,
  };
}

function unseenContext() {
  return {
    schedulingContextVersion: 1,
    opportunityKind: "unseen",
    effectiveEvidenceUse: "srs",
    expectedStateRevision: 0,
    gradePolicyVersion: "deterministic-correctness-cap-v1",
    activationPolicyVersion: "on-publication-v1",
    issuedAt: "2030-01-01T00:00:00.000Z",
    expiresAt: "2030-01-08T00:00:00.000Z",
    dueAtObserved: null,
  };
}

test("stored v2 applied receipt restores exactly without current authority", () => {
  const receipt = objectiveReceipt();
  const first = restoreObjectiveReceiptForRecovery(receipt, instanceId);
  const second = restoreObjectiveReceiptForRecovery(receipt, instanceId);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    receiptVersion: 2,
    attemptId,
    instanceId,
    acceptedAt: "2030-01-01T00:00:00.000Z",
    gradingStatus: "graded",
    isCorrect: true,
    applied: true,
    reason: "applied",
    effectiveGrade: "good",
    stateRevision: 3,
    dueAt: "2030-01-03T00:00:00.000Z",
  });
  assert.deepEqual(recoverObjectiveReceipt(receipt, instanceId), {
    kind: "accepted-applied",
    terminal: true,
    receipt: first,
  });
});

test("historical Objective Receipt v1 remains readable and never becomes v2 authority", () => {
  const receipt = objectiveReceipt({
    receiptVersion: 1,
    applied: false,
    reason: "practice-only",
    effectiveGrade: null,
    stateRevision: null,
    dueAt: null,
  });
  const restored = restoreObjectiveReceiptForRecovery(receipt, instanceId);
  assert.equal(restored.receiptVersion, 1);
  assert.equal(restored.applied, false);
  assert.equal(recoverObjectiveReceipt(receipt, instanceId).kind, "accepted-no-srs");
  const stored = createOfflineReceiptRecord("objective", receipt, instanceId, attemptId);
  assert.deepEqual(authoritativeReceiptResult(stored, instanceId).receipt, receipt);
  assert.deepEqual(restoreObjectiveOfflineReceiptForRecovery(stored, instanceId), restoreObjectiveReceiptForRecovery(receipt, instanceId));
});

test("accepted no-SRS v2 reasons remain terminal and are never retro-applied", () => {
  for (const reason of ["stale-opportunity", "issuance-context-missing", "practice-only", "grader-unavailable"] as const) {
    const outcome = recoverObjectiveReceipt(objectiveReceipt({
      applied: false,
      reason,
      effectiveGrade: null,
      stateRevision: null,
      dueAt: null,
    }), instanceId);
    assert.equal(outcome.kind, "accepted-no-srs");
    assert.equal(outcome.terminal, true);
    assert.equal(outcome.receipt.applied, false);
    assert.equal(outcome.receipt.stateRevision, null);
    assert.equal(outcome.receipt.dueAt, null);
  }
});

test("unknown and malformed receipts fail closed", () => {
  assert.throws(
    () => restoreObjectiveReceiptForRecovery(objectiveReceipt({ receiptVersion: 3 }), instanceId),
    ObjectiveRecoveryContractError,
  );
  assert.throws(
    () => restoreObjectiveReceiptForRecovery(objectiveReceipt({ reason: "stale-opportunity" }), instanceId),
    ObjectiveRecoveryContractError,
  );
  assert.throws(
    () => restoreObjectiveReceiptForRecovery(objectiveReceipt({ applied: false, reason: "stale-opportunity", effectiveGrade: "easy", stateRevision: null, dueAt: null }), instanceId),
    ObjectiveRecoveryContractError,
  );
});

test("all-null scheduling columns identify historical data; omitted/partial data is not state revision zero", () => {
  const historical = readObjectiveSchedulingContext(historicalContext());
  assert.deepEqual(historical, {
    kind: "historical-v1",
    schedulingContext: null,
    expectedStateRevision: null,
    srsAuthority: "none",
  });
  assert.deepEqual(readObjectiveSchedulingContext({
    ...historicalContext(),
    effectiveEvidenceUse: "srs",
  }), historical);
  assert.throws(() => readObjectiveSchedulingContext({ ...historicalContext(), expectedStateRevision: 0 }), ObjectiveRecoveryContractError);
  const incomplete = historicalContext();
  delete (incomplete as Record<string, unknown>).expiresAt;
  assert.throws(() => readObjectiveSchedulingContext(incomplete), ObjectiveRecoveryContractError);
});

test("versioned scheduling context preserves unseen/due/practice distinctions", () => {
  const unseen = readObjectiveSchedulingContext(unseenContext());
  assert.equal(unseen.kind, "v2");
  if (unseen.kind === "v2") {
    assert.equal(unseen.expectedStateRevision, 0);
    assert.equal(unseen.srsAuthority, "pinned");
  }

  const due = readObjectiveSchedulingContext({
    ...unseenContext(),
    opportunityKind: "due",
    expectedStateRevision: 4,
    dueAtObserved: "2029-12-31T00:00:00.000Z",
  });
  assert.equal(due.kind, "v2");
  if (due.kind === "v2") assert.equal(due.expectedStateRevision, 4);

  const practice = readObjectiveSchedulingContext({
    ...unseenContext(),
    opportunityKind: "practice",
    effectiveEvidenceUse: "practice-only",
    expectedStateRevision: null,
    expiresAt: null,
  });
  assert.equal(practice.kind, "v2");
  if (practice.kind === "v2") {
    assert.equal(practice.expectedStateRevision, null);
    assert.equal(practice.srsAuthority, "practice-only");
  }
});

test("terminal opportunities are never treated as active or attached to a replacement", () => {
  const oldOpportunity = readObjectiveOpportunityLifecycle({
    opportunityId: "33333333-3333-4333-8333-333333333333",
    instanceId,
    status: "terminal",
    terminalReason: "stale",
  });
  const replacement = readObjectiveOpportunityLifecycle({
    opportunityId: "44444444-4444-4444-8444-444444444444",
    instanceId: "55555555-5555-4555-8555-555555555555",
    status: "active",
    terminalReason: null,
  });
  assert.equal(opportunityOwnsActiveInstance(oldOpportunity, instanceId), false);
  assert.equal(opportunityOwnsActiveInstance(replacement, instanceId), false);
  assert.equal(opportunityOwnsActiveInstance(replacement, replacement.instanceId), true);
});

test("opportunity lifecycle reader rejects malformed or contradictory state", () => {
  assert.throws(() => readObjectiveOpportunityLifecycle({
    opportunityId: "x",
    instanceId,
    status: "active",
    terminalReason: "stale",
  }), ObjectiveRecoveryContractError);
  assert.throws(() => readObjectiveOpportunityLifecycle({
    opportunityId: "x",
    instanceId,
    status: "terminal",
    terminalReason: null,
  }), ObjectiveRecoveryContractError);
  assert.throws(() => readObjectiveOpportunityLifecycle({
    opportunityId: "x",
    instanceId,
    status: "active",
    terminalReason: null,
    hiddenAuthority: "state",
  }), ObjectiveRecoveryContractError);
});

