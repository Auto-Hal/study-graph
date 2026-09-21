import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).sort();
const fixFile = "20260921100000_fix_pilot_archive_conflict_target.sql";
assert.equal(files.length, 20);
assert.equal(files.at(-1), fixFile);

const baseline = "33cce5541d9528a35757860849185fb2c80a1fab";
for (const file of files.slice(0, 19)) {
  const committed = execFileSync("git", ["show", baseline + ":supabase/migrations/" + file], { encoding: "utf8" }).replace(/\r\n/g, "\n");
  const current = readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(current, committed, file + " changed relative to reviewed baseline");
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
