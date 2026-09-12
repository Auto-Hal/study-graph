import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSnapshotRefresh,
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  runProjectSnapshotRefreshWithDependencies,
  type SnapshotRefreshProjectId,
} from "./foreground-refresh-core.ts";
import type { SupportedProjectReadSnapshot } from "./read-contract.ts";
import type { SnapshotBackedProjectReadState } from "./read-runtime-core.ts";

const publishedAt = "2026-09-12T00:00:00.000Z";

function renderable(kind: "ready" | "stale" | "verified-local-replica" = "ready"): SnapshotBackedProjectReadState {
  const data = { publishedAt } as unknown as SupportedProjectReadSnapshot;
  return {
    kind,
    data,
    dataStatus: "available",
  } as unknown as SnapshotBackedProjectReadState;
}

function dependencies(
  state: SnapshotBackedProjectReadState,
  calls: SnapshotRefreshProjectId[] = [],
) {
  return {
    loadState: async () => state,
    publishers: {
      kuzushiji: async () => { calls.push("kuzushiji"); },
      "western-art-history": async () => { calls.push("western-art-history"); },
      philosophy: async () => { calls.push("philosophy"); },
    },
    now: () => Date.parse("2026-09-12T00:01:00.000Z"),
  };
}

test("foreground policy refreshes stale data but leaves ready data alone", async () => {
  assert.equal(decideSnapshotRefresh(renderable("ready"), "foreground"), "fresh");
  assert.equal(decideSnapshotRefresh(renderable("stale"), "foreground"), "publish");

  const calls: SnapshotRefreshProjectId[] = [];
  const fresh = await runProjectSnapshotRefreshWithDependencies("western-art-history", "foreground", dependencies(renderable("ready"), calls));
  assert.deepEqual(fresh, { projectId: "western-art-history", kind: "fresh" });
  assert.deepEqual(calls, []);

  const result = await runProjectSnapshotRefreshWithDependencies("western-art-history", "foreground", dependencies(renderable("stale"), calls));
  assert.deepEqual(result, { projectId: "western-art-history", kind: "refreshed" });
  assert.deepEqual(calls, ["western-art-history"]);
});

test("foreground missing, invalid, conflict, and unavailable states never publish", async () => {
  const states: SnapshotBackedProjectReadState[] = [
    { kind: "missing", reason: "not-yet-published" },
    { kind: "invalid-candidate", errorCode: "snapshot-invalid" },
    { kind: "conflict", errorCode: "snapshot-conflict" },
    { kind: "unavailable", errorCode: "snapshot-unavailable" },
  ];
  for (const state of states) {
    const calls: SnapshotRefreshProjectId[] = [];
    const result = await runProjectSnapshotRefreshWithDependencies("philosophy", "foreground", dependencies(state, calls));
    assert.equal(result.kind, state.kind === "missing" ? "missing" : state.kind === "unavailable" ? "unavailable" : "blocked");
    assert.deepEqual(calls, []);
  }
});

test("manual missing can bootstrap, while a recently published snapshot is cooled down", async () => {
  const calls: SnapshotRefreshProjectId[] = [];
  const missing = await runProjectSnapshotRefreshWithDependencies("kuzushiji", "manual", dependencies({ kind: "missing", reason: "not-yet-published" }, calls));
  assert.equal(missing.kind, "refreshed");
  assert.deepEqual(calls, ["kuzushiji"]);

  assert.equal(
    decideSnapshotRefresh(renderable(), "manual", Date.parse("2026-09-12T00:01:00.000Z"), MANUAL_REFRESH_MIN_INTERVAL_MS),
    "cooldown",
  );

  const cooledCalls: SnapshotRefreshProjectId[] = [];
  const cooled = await runProjectSnapshotRefreshWithDependencies("philosophy", "manual", dependencies(renderable(), cooledCalls));
  assert.equal(cooled.kind, "cooldown");
  assert.deepEqual(cooledCalls, []);

  const outsideCalls: SnapshotRefreshProjectId[] = [];
  const outside = await runProjectSnapshotRefreshWithDependencies("philosophy", "manual", {
    ...dependencies(renderable(), outsideCalls),
    now: () => Date.parse("2026-09-12T00:03:00.000Z"),
  });
  assert.equal(outside.kind, "refreshed");
  assert.deepEqual(outsideCalls, ["philosophy"]);
});

test("busy and publisher failures map to safe learner results", async () => {
  const state = renderable("stale");
  const busy = await runProjectSnapshotRefreshWithDependencies("kuzushiji", "foreground", {
    ...dependencies(state),
    publishers: { kuzushiji: async () => { throw Object.assign(new Error("lease"), { code: "snapshot_sync_in_progress" }); } },
  });
  assert.equal(busy.kind, "busy");

  const unavailable = await runProjectSnapshotRefreshWithDependencies("philosophy", "manual", {
    ...dependencies(state),
    now: () => Date.parse("2026-09-12T00:10:00.000Z"),
    publishers: { philosophy: async () => { throw new Error("source details never leave the server"); } },
  });
  assert.equal(unavailable.kind, "unavailable");
});

test("all three allowlisted projects dispatch to their existing publisher", async () => {
  const calls: SnapshotRefreshProjectId[] = [];
  for (const projectId of ["kuzushiji", "western-art-history", "philosophy"] as const) {
    const result = await runProjectSnapshotRefreshWithDependencies(projectId, "foreground", dependencies(renderable("stale"), calls));
    assert.equal(result.kind, "refreshed");
  }
  assert.deepEqual(calls, ["kuzushiji", "western-art-history", "philosophy"]);
});
