import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
const directory = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const repair = readFileSync(new URL(files[22], directory), "utf8");
test("forward repair replaces only the two offline functions, preserves restricted ACL and transaction boundary", () => {
  assert.equal(files.length, 23);
  assert.equal(files[22], "20261004065723_fix_offline_pilot_legacy_identity.sql");
  assert.deepEqual([...repair.matchAll(/create or replace function public\.(\w+)/g)].map((match) => match[1]), [
    "study_graph_prefetch_kuzushiji_objective_instance", "study_graph_prefetch_kuzushiji_objective_instance_v2",
  ]);
  assert.match(repair, /^begin;/);
  assert.match(repair, /commit;\s*$/);
  assert.equal((repair.match(/language plpgsql security definer set search_path = pg_catalog/g) ?? []).length, 2);
  assert.doesNotMatch(repair, /\b(?:alter table|create table|drop|update private\.|delete from|insert into private\.(?!offline_instance_issuance_requests))/i);
  assert.equal((repair.match(/grant execute on function/g) ?? []).length, 2);
  assert.equal((repair.match(/to service_role;/g) ?? []).length, 2);
  assert.match(repair, /offline_prefetch_v1_issuance_closed/);
  assert.match(repair, /p_legacy_exercise_id is distinct from\s*'kuzushiji.visual-reading.eitaigura-u3042-00032-1'/);
});
test("all 22 already applied migrations retain reviewed byte identity", () => {
  const hash = createHash("sha256");
  for (const name of files.slice(0, 22)) hash.update(name + "\n").update(readFileSync(new URL(name, directory)));
  assert.equal(hash.digest("hex"), "556721f1d0b3639aa969bf8721087f6dfee6403aedbcc01cec0dbc19e0222b78");
});
test("repair branch cannot auto-deploy while production remains unchanged", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.git.deploymentEnabled, { "fix/offline-wrapper-legacy-identity": false });
});
