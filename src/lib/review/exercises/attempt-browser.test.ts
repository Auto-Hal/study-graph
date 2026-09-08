import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { hashExerciseAttemptRequest } from "./attempt.ts";
import { hashExerciseAttemptRequestBrowser, type BrowserCryptoProvider } from "./attempt-browser.ts";

const browserCrypto = webcrypto as unknown as BrowserCryptoProvider;

const request = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  instanceId: "22222222-2222-4222-8222-222222222222",
  rawAnswer: "あ",
  selfEvaluation: "good" as const,
  responseMs: 1200,
  usedHint: false,
};
const EXPECTED_REQUEST_HASH = "c85ff5b4b3b1edc79c7de25ae294e557926d24faa4dcea633b0237dd753b3a02";

test("browser request hash matches the existing server hash", async () => {
  const browserHash = await hashExerciseAttemptRequestBrowser(request, browserCrypto);
  assert.equal(browserHash, hashExerciseAttemptRequest(request));
  assert.equal(browserHash, EXPECTED_REQUEST_HASH);
});

test("request hash excludes client timestamps, snapshots, and transport metadata", async () => {
  const base = await hashExerciseAttemptRequestBrowser(request, browserCrypto);
  const withMetadata = await hashExerciseAttemptRequestBrowser({
    ...request,
    submittedAt: "2040-01-01T00:00:00.000Z",
    clientTimestamp: "2040-01-01T00:00:01.000Z",
  } as typeof request, browserCrypto);
  assert.equal(withMetadata, base);
});

test("immutable submission fields change the request hash", async () => {
  const base = await hashExerciseAttemptRequestBrowser(request, browserCrypto);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, attemptId: "33333333-3333-4333-8333-333333333333" }, browserCrypto), base);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, instanceId: "44444444-4444-4444-8444-444444444444" }, browserCrypto), base);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, rawAnswer: "い" }, browserCrypto), base);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, selfEvaluation: "again" }, browserCrypto), base);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, responseMs: 1201 }, browserCrypto), base);
  assert.notEqual(await hashExerciseAttemptRequestBrowser({ ...request, usedHint: true }, browserCrypto), base);
});
