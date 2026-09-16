import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidObjectiveSchedulingContextV1,
  deterministicObjectiveGradeV1,
  OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1,
  OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1,
  OBJECTIVE_OPPORTUNITY_CONTRACT_VERSION,
  OBJECTIVE_SRS_OPPORTUNITY_TTL_SECONDS,
  validateObjectiveSchedulingContextV1,
} from "./objective-opportunity.ts";

const issuedAt = "2030-01-01T00:00:00.000Z";
const expiresAt = "2030-01-08T00:00:00.000Z";

function context(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    opportunityKind: "unseen",
    effectiveEvidenceUse: "srs",
    expectedStateRevision: 0,
    gradePolicyVersion: OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1,
    activationPolicyVersion: OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1,
    issuedAt,
    expiresAt,
    ...overrides,
  };
}

test("future Objective opportunity constants are explicitly versioned", () => {
  assert.equal(OBJECTIVE_OPPORTUNITY_CONTRACT_VERSION, 1);
  assert.equal(OBJECTIVE_ACTIVATION_POLICY_ON_PUBLICATION_V1, "on-publication-v1");
  assert.equal(OBJECTIVE_GRADE_POLICY_DETERMINISTIC_V1, "deterministic-correctness-cap-v1");
  assert.equal(OBJECTIVE_SRS_OPPORTUNITY_TTL_SECONDS, 604800);
});

test("unseen requires positively observed absent state and a valid expiry", () => {
  assertValidObjectiveSchedulingContextV1(context());
  assert.ok(validateObjectiveSchedulingContextV1(context({ expectedStateRevision: 1 })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ expectedStateRevision: null })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ expiresAt: null })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ issuedAt: "not-a-date" })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ issuedAt: "2030-02-31T00:00:00.000Z" })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ expiresAt: issuedAt })).length > 0);
});

test("due requires a positive safe observed state revision", () => {
  assertValidObjectiveSchedulingContextV1(context({ opportunityKind: "due", expectedStateRevision: 4, dueAtObserved: "2030-01-02T00:00:00.000Z" }));
  for (const expectedStateRevision of [0, null, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(validateObjectiveSchedulingContextV1(context({ opportunityKind: "due", expectedStateRevision })).length > 0);
  }
});

test("practice is outside SRS and has no expected revision or expiry", () => {
  const practice = context({ opportunityKind: "practice", effectiveEvidenceUse: "practice-only", expectedStateRevision: null, expiresAt: null });
  assertValidObjectiveSchedulingContextV1(practice);
  assert.ok(validateObjectiveSchedulingContextV1({ ...practice, expectedStateRevision: 1 }).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1({ ...practice, expiresAt }).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1({ ...practice, effectiveEvidenceUse: "srs" }).length > 0);
});

test("malformed and unknown scheduling context fields fail closed", () => {
  assert.ok(validateObjectiveSchedulingContextV1(context({ gradePolicyVersion: "deterministic" })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ activationPolicyVersion: "" })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ issuedAt: 0 })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ dueAtObserved: "yesterday" })).length > 0);
  assert.ok(validateObjectiveSchedulingContextV1(context({ extra: true })).length > 0);
});

test("future deterministic grade caps incorrect responses at again", () => {
  for (const selfEvaluation of ["again", "hard", "good", "easy"] as const) {
    assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "graded", isCorrect: false, selfEvaluation }), "again");
  }
});

test("future deterministic grade preserves self-evaluation for correct responses", () => {
  for (const selfEvaluation of ["again", "hard", "good", "easy"] as const) {
    assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "graded", isCorrect: true, selfEvaluation }), selfEvaluation);
  }
  assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "graded", isCorrect: true, selfEvaluation: null }), null);
});

test("ungraded or malformed grading input never produces an SRS grade", () => {
  assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "ungraded", isCorrect: null, selfEvaluation: "easy" }), null);
  assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "graded", isCorrect: null, selfEvaluation: "easy" }), null);
  assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "graded", isCorrect: true, selfEvaluation: "confident" }), null);
  assert.equal(deterministicObjectiveGradeV1({ gradingStatus: "unknown", isCorrect: false, selfEvaluation: "easy" }), null);
});
