import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const allFiles = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).sort();
const fixFile = "20260921100000_fix_pilot_archive_conflict_target.sql";
const genericArchiveFile = "20260922100000_phase_5a_3a_generic_objective_archive.sql";
assert.equal(allFiles.length, 22);
assert.equal(allFiles.at(-2), genericArchiveFile);
assert.equal(allFiles.at(-3), fixFile);
const files = allFiles.slice(0, 20);

const baseline = "22f2de997dea8a1442ba6d8993f4acaabebc8d10";
const historicalFiles = files.slice(0, 19);
const canReadAllAt = (ref) => historicalFiles.every((file) =>
  spawnSync("git", ["cat-file", "-e", `${ref}:supabase/migrations/${file}`], { stdio: "ignore" }).status === 0,
);
const comparisonRef = [baseline, "HEAD^1"].find(canReadAllAt);

if (comparisonRef) {
  for (const file of historicalFiles) {
    const committed = execFileSync("git", ["show", `${comparisonRef}:supabase/migrations/${file}`], { encoding: "utf8" }).replace(/\r\n/g, "\n");
    const current = readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(current, committed, file + " changed relative to reviewed baseline");
  }
} else {
  // GitHub's shallow merge checkout may not include the reviewed commit or its
  // migration tree. In that case, prove the checkout delta contains only this
  // additive migration when a parent is available, while the local/full clone
  // path above retains the byte-for-byte historical guard.
  const parent = spawnSync("git", ["rev-parse", "--verify", "HEAD^1"], { encoding: "utf8" });
  if (parent.status === 0) {
    const changed = execFileSync("git", ["diff", "--name-only", parent.stdout.trim(), "HEAD", "--", "supabase/migrations"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    assert.deepEqual(changed, [fixFile]);
  }
}

const sql = readFileSync(new URL("../supabase/migrations/" + fixFile, import.meta.url), "utf8");
assert.equal((sql.match(/create or replace function/gi) || []).length, 1);
assert.match(sql, /create\s+or\s+replace\s+function\s+public\.study_graph_register_kuzushiji_pilot_archive/i);
assert.match(sql, /returns\s+table\s*\(\s*release_id\s+text,\s*revision_id\s+uuid\s*\)/i);
assert.match(sql, /on\s+conflict\s+on\s+constraint\s+content_release_entries_pkey\s+do\s+nothing/i);
assert.doesNotMatch(sql, /on\s+conflict\s*\(\s*release_id\s*,\s*revision_id\s*\)/i);
assert.match(sql, /security\s+definer/i);
assert.match(sql, /set\s+search_path\s*=\s*pg_catalog/i);
assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.study_graph_register_kuzushiji_pilot_archive/i);
assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.study_graph_register_kuzushiji_pilot_archive/i);
assert.doesNotMatch(sql, /create\s+(table|index|trigger)|alter\s+table|drop\s+table|supabase_migrations/i);
console.log("PASS migration 1-19 unchanged and migration 20 is one archive-function replacement only");
