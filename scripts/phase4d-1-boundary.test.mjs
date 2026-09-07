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

test("Phase 4D-1 does not cut the objective model into runtime or API paths", () => {
  for (const relativePath of [
    "src/lib/review/registry.ts",
    "src/lib/review/pilot-runtime.ts",
    "src/components/ReviewSession.tsx",
    "app/api/review/pilot/issue/route.ts",
    "app/api/review/pilot/attempt/route.ts",
  ]) {
    const source = readFileSync(resolve(root, relativePath), "utf8");
    assert.doesNotMatch(source, /kuzushijiPilotObjective|ObjectiveSrsTarget|ExerciseObjectiveBinding/);
  }
});
