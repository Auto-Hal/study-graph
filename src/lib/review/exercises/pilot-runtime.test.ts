import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotPresentation,
  hashExerciseAttemptRequest,
  hashPilotPresentation,
} from "./attempt.ts";
import { kuzushijiPilotRevisionPayload } from "./kuzushiji-revision.ts";

test("pilot presentation is deterministic and answer-free", () => {
  const first = createPilotPresentation(kuzushijiPilotRevisionPayload);
  const second = createPilotPresentation(JSON.parse(JSON.stringify(kuzushijiPilotRevisionPayload)));
  assert.deepEqual(first, second);
  assert.equal(hashPilotPresentation(first), hashPilotPresentation(second));
  assert.equal("answerSpec" in first, false);
  assert.equal("acceptedAnswers" in first, false);
  assert.equal("pilotMetadata" in first, false);
  assert.equal(JSON.stringify(first).includes("motherCharacter"), false);
  assert.equal(JSON.stringify(first).includes("阿"), false);
});

test("pilot presentation hash changes when pinned presentation changes", () => {
  const presentation = createPilotPresentation(kuzushijiPilotRevisionPayload);
  const changed = { ...presentation, front: "別の表示" };
  assert.notEqual(hashPilotPresentation(presentation), hashPilotPresentation(changed));
});

test("pilot request hash excludes runtime timestamps", () => {
  const request = {
    attemptId: "11111111-1111-4111-8111-111111111111",
    instanceId: "22222222-2222-4222-8222-222222222222",
    rawAnswer: "あ",
    selfEvaluation: "good" as const,
    responseMs: 1000,
    usedHint: false,
    submittedAt: "2026-01-01T00:00:00.000Z",
    clientTimestamp: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(
    hashExerciseAttemptRequest(request),
    hashExerciseAttemptRequest({ ...request, submittedAt: "2027-01-01T00:00:00.000Z", clientTimestamp: "2027-01-01T00:00:00.000Z" }),
  );
  assert.notEqual(hashExerciseAttemptRequest(request), hashExerciseAttemptRequest({ ...request, responseMs: 1001 }));
});
