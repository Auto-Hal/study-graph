import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql")).sort();
const migration21 = "20260922100000_phase_5a_3a_generic_objective_archive.sql";
const reviewedBase = "18fe2f6a3f95827e7bf6f5a80b82fc0d127dd65a";

assert.equal(files.length, 21, "Phase 5A-3a must add exactly one migration");
assert.equal(files.at(-1), migration21);
const historicalFiles = files.slice(0, 20);
const canReadAllAt = (ref) => historicalFiles.every((file) =>
  spawnSync("git", ["cat-file", "-e", `${ref}:supabase/migrations/${file}`], { stdio: "ignore" }).status === 0,
);
const comparisonRef = [reviewedBase, "HEAD^1"].find(canReadAllAt);

if (comparisonRef) {
  for (const file of historicalFiles) {
    const committed = execFileSync("git", ["show", `${comparisonRef}:supabase/migrations/${file}`], { encoding: "utf8" }).replace(/\r\n/g, "\n");
    const current = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(current, committed, `${file} changed relative to approved baseline`);
  }
} else {
  const parent = spawnSync("git", ["rev-parse", "--verify", "HEAD^1"], { encoding: "utf8" });
  if (parent.status === 0) {
    const changed = execFileSync("git", ["diff", "--name-only", parent.stdout.trim(), "HEAD", "--", "supabase/migrations"], { encoding: "utf8" })
      .trim().split(/\r?\n/).filter(Boolean);
    assert.deepEqual(changed, [migration21], "only migration 21 may be added");
  }
}

const sql = readFileSync(new URL(`../supabase/migrations/${migration21}`, import.meta.url), "utf8");
const registrar = sql.match(/create\s+or\s+replace\s+function\s+public\.study_graph_register_objective_archive[\s\S]*?\n\$\$;/i)?.[0] ?? "";
const resolver = sql.match(/create\s+or\s+replace\s+function\s+public\.study_graph_resolve_objective_instance_archive[\s\S]*?\n\$\$;/i)?.[0] ?? "";

assert.equal((sql.match(/create\s+or\s+replace\s+function/gi) || []).length, 2);
assert.match(registrar, /p_release_id\s+text[\s\S]*p_manifest_schema_version\s+integer[\s\S]*p_manifest_hash\s+text[\s\S]*p_manifest\s+jsonb[\s\S]*p_source_git_sha\s+text[\s\S]*p_project_id\s+text[\s\S]*p_exercise_id\s+text[\s\S]*p_exercise_version\s+integer[\s\S]*p_content_hash\s+text[\s\S]*p_canonicalization_version\s+integer[\s\S]*p_canonical_payload\s+text[\s\S]*p_payload\s+jsonb[\s\S]*p_objective_id\s+text/i);
assert.match(registrar, /returns\s+table\s*\(\s*release_id\s+text,\s*revision_id\s+uuid\s*\)/i);
for (const identity of ["project_id", "exercise_id", "objective_id"]) assert.match(registrar, new RegExp(`p_${identity}[^\\n]*btrim|p_${identity}[^\\n]*<>`, "i"));
assert.match(registrar, /p_exercise_version\s+is null\s+or\s+p_exercise_version\s*<=\s*0/i);
assert.match(registrar, /p_payload\s+#>>\s*'\{projectId\}'\s*<>\s*p_project_id/i);
assert.match(registrar, /p_payload\s+#>>\s*'\{exerciseId\}'\s*<>\s*p_exercise_id/i);
assert.match(registrar, /p_payload\s+#>>\s*'\{objectiveId\}'\s*<>\s*p_objective_id/i);
assert.match(registrar, /on\s+conflict\s+on\s+constraint\s+content_release_entries_pkey\s+do\s+nothing/i);
assert.doesNotMatch(registrar, /on\s+conflict\s*\(\s*release_id\s*,\s*revision_id\s*\)/i);
assert.doesNotMatch(registrar, /unsupported_pilot_revision|kuzushiji/i);
assert.match(registrar, /security\s+definer/i);
assert.match(registrar, /set\s+search_path\s*=\s*pg_catalog/i);

for (const field of [
  "instance_id", "learner_id", "release_id", "revision_id", "presentation", "presentation_hash",
  "renderer_version", "adapter_version", "locale", "scope_evidence", "knowledge_binding", "legacy_item_id",
  "legacy_item_kind", "legacy_exercise_id", "srs_target", "srs_epoch", "revision_payload", "revision_status",
  "project_id", "exercise_id", "exercise_version", "content_hash",
]) assert.match(resolver, new RegExp(`\\b${field}\\b`, "i"));
assert.match(resolver, /where\s+ei\.instance_id\s*=\s*p_instance_id\s+and\s+ei\.learner_id\s*=\s*p_learner_id/i);
assert.match(resolver, /join\s+private\.exercise_revisions\s+er\s+on\s+er\.revision_id\s*=\s*ei\.revision_id/i);
assert.doesNotMatch(resolver, /'kuzushiji|visual-reading\.eitaigura/i);

for (const name of ["study_graph_register_objective_archive", "study_graph_resolve_objective_instance_archive"]) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}`, "i"));
  assert.match(sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}[\\s\\S]*?to\\s+service_role`, "i"));
}
assert.doesNotMatch(sql, /create\s+(table|index|trigger)|alter\s+table|drop\s+table|enable\s+row\s+level\s+security/i);
assert.doesNotMatch(resolver, /\b(insert|update|delete|for\s+update|pg_advisory)\b/i);

const helper = readFileSync(new URL("../src/lib/supabase/objective-archive.ts", import.meta.url), "utf8");
assert.match(helper, /^import\s+["']server-only["'];/m);
assert.match(helper, /study_graph_register_objective_archive/);
assert.match(helper, /study_graph_register_objective_definition/);
assert.match(helper, /study_graph_register_exercise_objective_binding/);
assert.match(helper, /study_graph_resolve_objective_instance_archive/);
assert.doesNotMatch(helper, /p_revision_id/);
assert.doesNotMatch(helper, /kuzushiji/i);
assert.match(helper, /assertValidObjectiveDefinition/);
assert.match(helper, /assertValidExerciseObjectiveBinding/);

const helperTest = readFileSync(new URL("../src/lib/supabase/objective-archive.test.ts", import.meta.url), "utf8");
const databaseTest = readFileSync(new URL("./phase5a-3a-generic-objective-archive-db.test.mjs", import.meta.url), "utf8");
const philosophyFixture = readFileSync(new URL("../src/lib/review/exercises/test-fixtures/philosophy-arche.ts", import.meta.url), "utf8");
for (const source of [helperTest, databaseTest, philosophyFixture]) {
  assert.doesNotMatch(source, /\bas\s+never\b|\bas\s+unknown\s+as\s+|:\s*any\b|\bas\s+any\b|deterministic-text-v1/);
}
assert.match(helperTest, /philosophyArcheContentRelease/);
assert.match(helperTest, /canonicalizeExerciseRevision\(revisionPayload\)/);
assert.match(helperTest, /p_revision_content_hash:\s*revision\.contentHash/);
assert.match(databaseTest, /philosophyArcheContentRelease/);
assert.match(databaseTest, /canonicalizeExerciseRevision\(philosophyArcheRevisionPayload\)/);
assert.match(philosophyFixture, /createExerciseRevision\([\s\S]*?null,?\s*\)/);
assert.match(philosophyFixture, /createContentReleaseManifest\(\[philosophyArcheRevision\]\)/);
assert.match(philosophyFixture, /createContentRelease\(/);

console.log("PASS Phase 5A-3a migration 21 is additive and generic archive boundaries are guarded");
