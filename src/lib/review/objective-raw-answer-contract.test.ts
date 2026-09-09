import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { validatePilotAttemptInput } from "./pilot-attempt-contract.ts";
import {
  gradeExerciseRevision,
  hashExerciseAttemptRequest,
} from "./exercises/attempt.ts";
import { hashExerciseAttemptRequestBrowser } from "./exercises/attempt-browser.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pilotRuntime = readFileSync(resolve(root, "src/lib/review/pilot-runtime.ts"), "utf8");
const pilotRpc = readFileSync(resolve(root, "src/lib/supabase/pilot.ts"), "utf8");

const attemptId = "9663045d-5a91-4e15-a5fd-2f331cc49063";
const instanceId = "642c022c-0606-496a-998b-a6ef115c1618";
const revision = {
  answerSpec: { type: "text", acceptedAnswers: ["あ"] },
  gradingSpec: {
    strategyId: "legacy-text-v1",
    strategyVersion: 1,
    normalization: "review-session-ja-v1",
  },
} as Parameters<typeof gradeExerciseRevision>[0];

function body(rawAnswer: unknown) {
  return {
    attemptId,
    instanceId,
    rawAnswer,
    selfEvaluation: "good",
    responseMs: 8027,
    usedHint: false,
  };
}

function runPipeline(rawAnswer: string | { type: "text"; value: string }) {
  const parsed = validatePilotAttemptInput(body(rawAnswer));
  if (!parsed.ok) throw new Error(`validation failed: ${parsed.error}`);

  const request = parsed.request;
  assert.strictEqual(request.rawAnswer, rawAnswer);

  const grading = gradeExerciseRevision(revision, request.rawAnswer);
  const requestHash = hashExerciseAttemptRequest(request);
  const objectiveRpcPayload = {
    p_attempt_id: request.attemptId,
    p_instance_id: request.instanceId,
    p_raw_answer: request.rawAnswer,
    p_normalized_answer: grading.normalizedAnswer,
    p_is_correct: grading.isCorrect,
  };

  return { request, grading, requestHash, objectiveRpcPayload };
}

test("string rawAnswer survives validation, grading, and Objective RPC payload construction", () => {
  const result = runPipeline("あ");

  assert.equal(result.request.rawAnswer, "あ");
  assert.equal(result.grading.gradingStatus, "graded");
  assert.equal(result.grading.normalizedAnswer, "あ");
  assert.equal(result.grading.isCorrect, true);
  assert.equal(result.objectiveRpcPayload.p_raw_answer, "あ");

  assert.match(pilotRuntime, /gradeExerciseRevision\(instance\.revision_payload, request\.rawAnswer\)/);
  assert.match(pilotRuntime, /recordKuzushijiObjectivePilotAttempt\(\{/);
  assert.match(
    pilotRpc,
    /recordKuzushijiObjectivePilotAttempt[\s\S]*?p_raw_answer: input\.request\.rawAnswer/,
  );
});

test("text wrapper rawAnswer remains an accepted and unchanged representation", () => {
  const rawAnswer = { type: "text" as const, value: "あ" };
  const result = runPipeline(rawAnswer);

  assert.strictEqual(result.request.rawAnswer, rawAnswer);
  assert.strictEqual(result.objectiveRpcPayload.p_raw_answer, rawAnswer);
  assert.equal(result.grading.gradingStatus, "graded");
  assert.equal(result.grading.normalizedAnswer, "あ");
  assert.equal(result.grading.isCorrect, true);
});

test("request hash preserves representation identity and browser/server parity", async () => {
  const stringResult = runPipeline("あ");
  const wrapperResult = runPipeline({ type: "text", value: "あ" });

  assert.notEqual(
    stringResult.requestHash,
    wrapperResult.requestHash,
    "transport normalization would change the immutable request identity",
  );
  assert.equal(
    await hashExerciseAttemptRequestBrowser(
      stringResult.request,
      webcrypto as unknown as Pick<Crypto, "subtle">,
    ),
    stringResult.requestHash,
  );
  assert.equal(
    await hashExerciseAttemptRequestBrowser(
      wrapperResult.request,
      webcrypto as unknown as Pick<Crypto, "subtle">,
    ),
    wrapperResult.requestHash,
  );
});
