import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLegacySchedule,
  canonicalizeExerciseAttemptRequest,
  gradeExerciseRevision,
  hashExerciseAttemptRequest,
  planLegacySrs,
  type ExerciseAttemptRequest,
} from "./attempt.ts";
import { kuzushijiPilotRevisionPayload } from "./kuzushiji-revision.ts";
import type { ExerciseRevisionPayload } from "./revision.ts";

function request(overrides: Partial<ExerciseAttemptRequest> = {}): ExerciseAttemptRequest {
  return {
    attemptId: "11111111-1111-4111-8111-111111111111",
    instanceId: "22222222-2222-4222-8222-222222222222",
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
    ...overrides,
  };
}

function revisionCopy(): ExerciseRevisionPayload {
  return JSON.parse(JSON.stringify(kuzushijiPilotRevisionPayload)) as ExerciseRevisionPayload;
}

test("legacy-text-v1 grades the pilot's correct Japanese answer", () => {
  const result = gradeExerciseRevision(kuzushijiPilotRevisionPayload, "あ");
  assert.equal(result.gradingStatus, "graded");
  assert.equal(result.normalizedAnswer, "あ");
  assert.equal(result.isCorrect, true);
  assert.equal(result.gradingAuthority, "server");
  assert.equal(result.gradingStrategyId, "legacy-text-v1");
  assert.equal(result.gradingStrategyVersion, 1);
  assert.equal(result.normalizerVersion, "review-session-ja-v1");
});

test("legacy-text-v1 preserves the existing normalization and rejects a wrong answer", () => {
  const correct = gradeExerciseRevision(kuzushijiPilotRevisionPayload, { type: "text", value: " あ。 " });
  const wrong = gradeExerciseRevision(kuzushijiPilotRevisionPayload, "い");
  assert.equal(correct.normalizedAnswer, "あ");
  assert.equal(correct.isCorrect, true);
  assert.equal(wrong.normalizedAnswer, "い");
  assert.equal(wrong.isCorrect, false);
});

test("unsupported grader or answer shape is ungraded and cannot be treated as correct", () => {
  const unsupported = revisionCopy();
  unsupported.gradingSpec = {
    ...unsupported.gradingSpec,
    strategyId: "future-grader",
  } as unknown as ExerciseRevisionPayload["gradingSpec"];
  const unsupportedResult = gradeExerciseRevision(unsupported, "あ");
  const invalidAnswerResult = gradeExerciseRevision(kuzushijiPilotRevisionPayload, { value: "あ" });
  assert.equal(unsupportedResult.gradingStatus, "ungraded");
  assert.equal(unsupportedResult.isCorrect, null);
  assert.equal(invalidAnswerResult.gradingStatus, "ungraded");
  assert.equal(invalidAnswerResult.isCorrect, null);
});

test("request hash is deterministic, canonical, and excludes timestamps", () => {
  const first = request({ rawAnswer: { type: "text", value: "あ" } });
  const reordered = request({ rawAnswer: { value: "あ", type: "text" } });
  const timestamped = request({
    rawAnswer: { type: "text", value: "あ" },
    submittedAt: "2030-01-01T00:00:00.000Z",
    clientTimestamp: "2030-01-01T00:00:01.000Z",
  });
  assert.equal(canonicalizeExerciseAttemptRequest(first), canonicalizeExerciseAttemptRequest(reordered));
  assert.equal(hashExerciseAttemptRequest(first), hashExerciseAttemptRequest(reordered));
  assert.equal(hashExerciseAttemptRequest(first), hashExerciseAttemptRequest(timestamped));
});

test("request hash changes for every immutable submission field", () => {
  const baseHash = hashExerciseAttemptRequest(request());
  const mutations: ExerciseAttemptRequest[] = [
    request({ attemptId: "33333333-3333-4333-8333-333333333333" }),
    request({ instanceId: "44444444-4444-4444-8444-444444444444" }),
    request({ rawAnswer: "い" }),
    request({ selfEvaluation: "easy" }),
    request({ responseMs: 1201 }),
    request({ usedHint: true }),
  ];
  for (const mutation of mutations) assert.notEqual(hashExerciseAttemptRequest(mutation), baseHash);
});

test("legacy scheduler matches the existing initial and repeated intervals", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  assert.deepEqual(calculateLegacySchedule("again", 8, 4, now), {
    intervalDays: 0,
    repetitions: 0,
    dueAt: "2030-01-01T00:10:00.000Z",
  });
  assert.equal(calculateLegacySchedule("hard", 0, 0, now).intervalDays, 1);
  assert.equal(calculateLegacySchedule("good", 0, 0, now).intervalDays, 2);
  assert.equal(calculateLegacySchedule("easy", 0, 0, now).intervalDays, 5);
  assert.equal(calculateLegacySchedule("hard", 5, 2, now).intervalDays, 6);
  assert.equal(calculateLegacySchedule("good", 5, 2, now).intervalDays, 11);
  assert.equal(calculateLegacySchedule("easy", 5, 2, now).intervalDays, 16);
  assert.equal(calculateLegacySchedule("good", 5, 2, now).repetitions, 3);
});

test("SRS planning keeps grading, scope, and quarantine decisions separate", () => {
  assert.deepEqual(planLegacySrs({ gradingStatus: "graded", scopeAccepted: true, revisionStatus: "approved" }), {
    srsApplied: true,
    reason: "applied",
  });
  assert.deepEqual(planLegacySrs({ gradingStatus: "ungraded", scopeAccepted: true, revisionStatus: "approved" }), {
    srsApplied: false,
    reason: "grader-unavailable",
  });
  assert.deepEqual(planLegacySrs({ gradingStatus: "graded", scopeAccepted: false, revisionStatus: "approved" }), {
    srsApplied: false,
    reason: "scope-not-eligible",
  });
  assert.deepEqual(planLegacySrs({ gradingStatus: "graded", scopeAccepted: true, revisionStatus: "quarantined" }), {
    srsApplied: false,
    reason: "revision-quarantined",
  });
});
