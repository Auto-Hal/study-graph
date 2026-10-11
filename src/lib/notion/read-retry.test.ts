import assert from "node:assert/strict";
import test from "node:test";
import { readNotionWithRetry } from "./read-retry.ts";

const throttled = (seconds?: string, reason?: string, status = 429) => new Response(
  JSON.stringify({ code: status === 529 ? "service_overload" : "rate_limited", additional_data: { rate_limit_reason: reason } }),
  { status, headers: seconds === undefined ? undefined : { "Retry-After": seconds } },
);

test("successful reads return their response without waiting", async () => {
  const response = new Response('{"results":[1]}');
  assert.equal(await readNotionWithRetry(async () => response, async () => assert.fail("unexpected retry")), response);
  assert.deepEqual(await response.json(), { results: [1] });
});

test("429 waits for Retry-After then repeats the same read", async () => {
  const waits: number[] = [], requests: string[] = [];
  const response = await readNotionWithRetry(async () => {
    requests.push("same-data-source-and-cursor");
    return requests.length === 1 ? throttled("4") : new Response('{"results":[2]}');
  }, async (ms) => { waits.push(ms); }, () => 0);
  assert.deepEqual(waits, [4_000]);
  assert.deepEqual(requests, ["same-data-source-and-cursor", "same-data-source-and-cursor"]);
  assert.deepEqual(await response.json(), { results: [2] });
});

test("zero Retry-After is usable and jitter never shortens the requested wait", async () => {
  const waits: number[] = [];
  let requests = 0;
  await readNotionWithRetry(async () => ++requests === 1 ? throttled("0") : new Response(), async (ms) => { waits.push(ms); }, () => 0.5);
  assert.deepEqual(waits, [125]);
  assert.equal(requests, 2);
});

test("529 overload recovers using its Retry-After", async () => {
  const waits: number[] = [];
  let requests = 0;
  await readNotionWithRetry(async () => ++requests === 1 ? throttled("3", undefined, 529) : new Response(), async (ms) => { waits.push(ms); }, () => 0);
  assert.deepEqual(waits, [3_000]);
  assert.equal(requests, 2);
});

test("persistent throttling stops after three requests and preserves the final error body", async () => {
  const waits: number[] = [];
  let requests = 0;
  const response = await readNotionWithRetry(async () => { requests++; return throttled("1"); }, async (ms) => { waits.push(ms); }, () => 0);
  assert.equal(requests, 3);
  assert.deepEqual(waits, [1_000, 2_000]);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "rate_limited");
});

test("a long Retry-After returns the error without retrying early", async () => {
  let requests = 0;
  const response = await readNotionWithRetry(async () => { requests++; return throttled("60"); }, async () => assert.fail("must not retry early"));
  assert.equal(requests, 1);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "rate_limited");
});

test("the total wait budget also bounds repeated retries", async () => {
  const waits: number[] = [];
  let requests = 0;
  const response = await readNotionWithRetry(async () => { requests++; return throttled("8"); }, async (ms) => { waits.push(ms); }, () => 0);
  assert.deepEqual(waits, [8_000]);
  assert.equal(requests, 2);
  assert.equal(response.status, 429);
});

test("missing or malformed Retry-After uses increasing fallback waits", async () => {
  for (const header of [undefined, "", "invalid", "-1", "1.5"]) {
    const waits: number[] = [];
    const response = await readNotionWithRetry(async () => throttled(header), async (ms) => { waits.push(ms); }, () => 0);
    assert.deepEqual(waits, [1_000, 2_000]);
    assert.equal(response.status, 429);
  }
});

test("blocked Notion access is never retried", async () => {
  let requests = 0;
  const response = await readNotionWithRetry(async () => { requests++; return throttled("0", "public_api_request_blocked"); }, async () => assert.fail("blocked access"));
  assert.equal(requests, 1);
  assert.equal((await response.json()).additional_data.rate_limit_reason, "public_api_request_blocked");
});

test("authentication and other HTTP errors keep their original response without retries", async () => {
  for (const status of [400, 401, 403, 404, 500, 503]) {
    const response = new Response("original error", { status });
    assert.equal(await readNotionWithRetry(async () => response, async () => assert.fail("unexpected retry")), response);
    assert.equal(await response.text(), "original error");
  }
});

test("network failures propagate without inventing a successful read", async () => {
  const failure = new Error("network unavailable");
  await assert.rejects(readNotionWithRetry(async () => { throw failure; }), (error) => error === failure);
});
