import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectSnapshotRefreshCoordinator,
  type CoordinatorIntent,
  type CoordinatorProjectId,
  type CoordinatorResult,
} from "./project-snapshot-refresh-coordinator.ts";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function harness() {
  const calls: Array<{ projectId: CoordinatorProjectId; intent: CoordinatorIntent }> = [];
  const pending: Deferred<CoordinatorResult>[] = [];
  const coordinator = createProjectSnapshotRefreshCoordinator(async (projectId, intent) => {
    calls.push({ projectId, intent });
    const request = deferred<CoordinatorResult>();
    pending.push(request);
    return request.promise;
  });
  return { calls, pending, coordinator };
}

const result = (projectId: CoordinatorProjectId, kind: CoordinatorResult["kind"]): CoordinatorResult => ({ projectId, kind });

test("manual during foreground missing waits, then performs the allowed manual publication", async () => {
  const { calls, pending, coordinator } = harness();
  const foreground = coordinator.request("philosophy", "foreground");
  await flush();
  const manual = coordinator.request("philosophy", "manual");

  assert.deepEqual(calls, [{ projectId: "philosophy", intent: "foreground" }]);
  pending[0]?.resolve(result("philosophy", "missing"));
  await flush();
  assert.deepEqual(calls, [
    { projectId: "philosophy", intent: "foreground" },
    { projectId: "philosophy", intent: "manual" },
  ]);
  pending[1]?.resolve(result("philosophy", "refreshed"));
  assert.deepEqual(await manual, result("philosophy", "refreshed"));
  assert.deepEqual(await foreground, result("philosophy", "missing"));
});

test("manual during stale foreground reuses a successful publication without a duplicate", async () => {
  const { calls, pending, coordinator } = harness();
  const foreground = coordinator.request("western-art-history", "foreground");
  await flush();
  const manual = coordinator.request("western-art-history", "manual");
  pending[0]?.resolve(result("western-art-history", "refreshed"));

  assert.deepEqual(await foreground, result("western-art-history", "refreshed"));
  assert.deepEqual(await manual, result("western-art-history", "refreshed"));
  assert.deepEqual(calls, [{ projectId: "western-art-history", intent: "foreground" }]);
});

test("manual during a ready foreground result is evaluated again with manual intent", async () => {
  const { calls, pending, coordinator } = harness();
  const foreground = coordinator.request("philosophy", "foreground");
  await flush();
  const manual = coordinator.request("philosophy", "manual");
  pending[0]?.resolve(result("philosophy", "fresh"));
  await flush();

  assert.deepEqual(calls, [
    { projectId: "philosophy", intent: "foreground" },
    { projectId: "philosophy", intent: "manual" },
  ]);
  pending[1]?.resolve(result("philosophy", "refreshed"));
  assert.deepEqual(await manual, result("philosophy", "refreshed"));
  assert.deepEqual(await foreground, result("philosophy", "fresh"));
});

test("a remounted coordinator joins in-flight work before throttle and receives refreshed adoption", async () => {
  const { calls, pending, coordinator } = harness();
  const routeA = coordinator.requestForeground("kuzushiji");
  await flush();
  const routeB = coordinator.requestForeground("kuzushiji");
  assert.strictEqual(routeB, routeA);
  assert.deepEqual(calls, [{ projectId: "kuzushiji", intent: "foreground" }]);

  let adopted = 0;
  void routeB?.then((value) => {
    if (value.kind === "refreshed") adopted += 1;
  });
  pending[0]?.resolve(result("kuzushiji", "refreshed"));
  await routeB;
  assert.equal(adopted, 1);
});

test("ordinary foreground requests remain throttled after completion", async () => {
  let now = 10_000;
  const { calls, pending, coordinator } = (() => {
    const calls: Array<{ projectId: CoordinatorProjectId; intent: CoordinatorIntent }> = [];
    const pending: Deferred<CoordinatorResult>[] = [];
    const coordinator = createProjectSnapshotRefreshCoordinator(async (projectId, intent) => {
      calls.push({ projectId, intent });
      const request = deferred<CoordinatorResult>();
      pending.push(request);
      return request.promise;
    }, { now: () => now });
    return { calls, pending, coordinator };
  })();

  const first = coordinator.requestForeground("philosophy");
  await flush();
  pending[0]?.resolve(result("philosophy", "fresh"));
  await first;
  now += 60_000;
  assert.equal(coordinator.requestForeground("philosophy"), null);
  assert.equal(calls.length, 1);
});

test("same-intent callers share one promise and metadata keeps the active intent", () => {
  const { coordinator } = harness();
  const first = coordinator.request("western-art-history", "foreground");
  const second = coordinator.request("western-art-history", "foreground");
  assert.strictEqual(second, first);
  assert.deepEqual(coordinator.getInFlight("western-art-history"), {
    projectId: "western-art-history",
    intent: "foreground",
    promise: first,
  });
});

test("same manual callers share one promise, and foreground joins the stronger manual request", () => {
  const { calls, coordinator } = harness();
  const manual = coordinator.request("kuzushiji", "manual");
  const sameManual = coordinator.request("kuzushiji", "manual");
  const foreground = coordinator.request("kuzushiji", "foreground");
  assert.strictEqual(sameManual, manual);
  assert.strictEqual(foreground, manual);
  assert.deepEqual(calls, []);
  assert.equal(coordinator.getInFlight("kuzushiji")?.intent, "manual");
});

test("unavailable completion is quiet and does not fabricate a refreshed result", async () => {
  const { pending, coordinator } = harness();
  const request = coordinator.requestForeground("philosophy");
  await flush();
  pending[0]?.resolve(result("philosophy", "unavailable"));
  assert.deepEqual(await request, result("philosophy", "unavailable"));
  assert.equal(coordinator.getInFlight("philosophy"), undefined);
});
