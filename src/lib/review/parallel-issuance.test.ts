import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareReviewExercises } from "./parallel-issuance.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("overlaps at most three exercises and preserves order when responses finish out of order", async () => {
  const gates = Array.from({ length: 6 }, deferred);
  const started: number[] = [];
  let running = 0, maximum = 0;
  const result = prepareReviewExercises([0, 1, 2, 3, 4, 5], async (entry) => {
    started.push(entry); maximum = Math.max(maximum, ++running);
    await gates[entry].promise;
    running--;
    return "question-" + entry;
  });
  assert.deepEqual(started, [0, 1, 2]);
  gates[2].resolve(); await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[1].resolve(); await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  gates[0].resolve(); await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  for (const gate of gates) gate.resolve();
  assert.deepEqual(await result, ["question-0", "question-1", "question-2", "question-3", "question-4", "question-5"]);
  assert.equal(maximum, 3);
});

test("stops queuing after failure and settles in-flight work before returning the error", async () => {
  const gate = deferred(), second = deferred();
  const failure = new Error("issue failed");
  const started: number[] = [];
  let settled = false;
  const result = prepareReviewExercises([0, 1, 2, 3, 4], async (entry) => {
    started.push(entry);
    if (entry === 0) throw failure;
    await (entry === 1 ? gate.promise : second.promise);
    return entry;
  });
  const outcome = result.then(() => { throw new Error("expected rejection"); }, (error) => { settled = true; return error; });
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(settled, false);
  assert.deepEqual(started, [0, 1, 2]);
  gate.resolve(); await new Promise<void>((done) => setImmediate(done));
  assert.equal(settled, false);
  second.resolve();
  assert.equal(await outcome, failure);
  assert.deepEqual(started, [0, 1, 2]);
});

test("does no preparation for an empty eligible set", async () => {
  let calls = 0;
  assert.deepEqual(await prepareReviewExercises([], async () => { calls++; return "unexpected"; }), []);
  assert.equal(calls, 0);
});
