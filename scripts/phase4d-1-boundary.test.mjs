import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const objective = readFileSync(resolve(root, "src/lib/review/objectives.ts"), "utf8");
const pilotObjective = readFileSync(resolve(root, "src/lib/review/exercises/kuzushiji-objective.ts"), "utf8");

test("Phase 4D-1 objective modules remain pure and do not add a Supabase migration", () => {
  assert.doesNotMatch(objective, /supabase|ReviewSession|\/api\//i);
  assert.doesNotMatch(pilotObjective, /supabase|ReviewSession|\/api\//i);
  assert.equal(
    readdirSync(resolve(root, "supabase/migrations")).some((name) => /phase4d/i.test(name)),
    false,
  );
});

test("existing Phase 4D-4 runtime remains isolated from future Phase 5A-1a policies", () => {
  const runtime = readFileSync(resolve(root, "src/lib/review/pilot-runtime.ts"), "utf8");
  assert.match(runtime, /kuzushijiPilotObjectiveBinding/);
  assert.match(runtime, /resultFromStoredObjectiveReceipt/);
  assert.doesNotMatch(runtime, /objective-opportunity|deterministicObjectiveGradeV1/);
});
