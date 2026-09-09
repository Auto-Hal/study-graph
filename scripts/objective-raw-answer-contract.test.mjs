import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const previousSql = readFileSync(
  resolve(root, "supabase/migrations/20260908100000_phase_4d_2_objective_persistence.sql"),
  "utf8",
);
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260909100000_fix_objective_raw_answer_contract.sql"),
  "utf8",
);
const pilotContract = readFileSync(
  resolve(root, "src/lib/review/pilot-attempt-contract.ts"),
  "utf8",
);
const attempt = readFileSync(
  resolve(root, "src/lib/review/exercises/attempt.ts"),
  "utf8",
);
const pilotRpc = readFileSync(resolve(root, "src/lib/supabase/pilot.ts"), "utf8");
const normalizedMigration = normalizeSql(migration);

function normalizeSql(value) {
  return value.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
}

function objectiveFunction(value) {
  const start = value.indexOf(
    "create or replace function public.study_graph_record_objective_attempt(",
  );
  assert.notEqual(start, -1, "Objective RPC definition is present");
  const end = value.indexOf("$$;", start);
  assert.notEqual(end, -1, "Objective RPC body has a terminator");
  return normalizeSql(value.slice(start, end + 3));
}

const previousFunction = objectiveFunction(previousSql);
const replacementFunction = objectiveFunction(migration);
const oldGuard =
  "or p_raw_answer is null or jsonb_typeof(p_raw_answer) <> 'object'";
const newGuard = normalizeSql(`or p_raw_answer is null
  or not coalesce(
    jsonb_typeof(p_raw_answer) = 'string'
    or (
      jsonb_typeof(p_raw_answer) = 'object'
      and p_raw_answer ->> 'type' = 'text'
      and jsonb_typeof(p_raw_answer -> 'value') = 'string'
    ),
    false
  )`);

const fixtures = [
  { label: "JSON string", rawAnswer: "あ", accepted: true },
  { label: "text wrapper", rawAnswer: { type: "text", value: "あ" }, accepted: true },
  { label: "SQL/JSON null", rawAnswer: null, accepted: false },
  { label: "empty object", rawAnswer: {}, accepted: false },
  { label: "arbitrary object", rawAnswer: { answer: "あ" }, accepted: false },
  { label: "wrong wrapper type", rawAnswer: { type: "other", value: "あ" }, accepted: false },
  { label: "missing wrapper value", rawAnswer: { type: "text" }, accepted: false },
  { label: "non-string wrapper value", rawAnswer: { type: "text", value: 123 }, accepted: false },
  { label: "array", rawAnswer: ["あ"], accepted: false },
  { label: "number", rawAnswer: 1, accepted: false },
  { label: "boolean", rawAnswer: true, accepted: false },
];

function acceptsRawAnswer(value) {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return true;
  return Boolean(
    typeof value === "object"
      && !Array.isArray(value)
      && value.type === "text"
      && typeof value.value === "string",
  );
}

test("migration is additive and replaces only the Objective rawAnswer guard", () => {
  const normalized = normalizedMigration;
  assert.match(normalized, /^begin; /);
  assert.match(normalized, / commit;$/);
  assert.equal(
    (normalized.match(/create or replace function public\.study_graph_record_objective_attempt/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(normalized, /\b(drop|alter table|truncate)\b/);
  assert.doesNotMatch(normalized, /create table|insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalized, /grant |revoke /i);
  assert.doesNotMatch(normalized, /create or replace function public\.study_graph_record_exercise_attempt/);
});

test("Objective RPC signature and security boundary are unchanged", () => {
  const previousHeader = previousFunction.slice(0, previousFunction.indexOf("as $$"));
  const replacementHeader = replacementFunction.slice(0, replacementFunction.indexOf("as $$"));
  assert.equal(replacementHeader, previousHeader);
  assert.match(replacementFunction, /security definer/);
  assert.match(replacementFunction, /set search_path = pg_catalog/);
  assert.match(previousSql, /revoke all on function public\.study_graph_record_objective_attempt[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(previousSql, /grant execute on function public\.study_graph_record_objective_attempt[\s\S]*?to service_role/);
  assert.doesNotMatch(normalizedMigration, /revoke all on function|grant execute on function/i);
});

test("SRS, receipt, and immutable persistence body is byte-for-byte preserved apart from the guard", () => {
  assert.equal(
    replacementFunction.replace(newGuard, oldGuard),
    previousFunction,
  );
  for (const pattern of [
    /pg_advisory_xact_lock/,
    /return query select v_existing_application\.receipt/,
    /insert into private\.exercise_attempts/,
    /insert into private\.objective_review_state/,
    /insert into private\.objective_srs_applications/,
    /state_revision/,
    /due_at/,
    /raw_answer[\s\S]*p_raw_answer/,
  ]) assert.match(replacementFunction, pattern);
  assert.doesNotMatch(replacementFunction, /insert into public\.(review_state|review_attempts)/);
});

test("SQL rawAnswer contract explicitly accepts only the two application representations", () => {
  const normalized = normalizeSql(migration);
  assert.doesNotMatch(normalized, /jsonb_typeof\(p_raw_answer\) <> 'object'/);
  assert.match(normalized, /jsonb_typeof\(p_raw_answer\) = 'string'/);
  assert.match(normalized, /jsonb_typeof\(p_raw_answer\) = 'object'/);
  assert.match(normalized, /p_raw_answer ->> 'type' = 'text'/);
  assert.match(normalized, /jsonb_typeof\(p_raw_answer -> 'value'\) = 'string'/);
  assert.match(normalized, /not coalesce\([\s\S]*false\)/);
  for (const fixture of fixtures) {
    assert.equal(
      acceptsRawAnswer(fixture.rawAnswer),
      fixture.accepted,
      fixture.label,
    );
  }
});

test("application validator, grader, and RPC payload retain rawAnswer representation", () => {
  assert.match(
    pilotContract,
    /typeof rawAnswer !== "string"[\s\S]*rawAnswer as Record<string, unknown>\)\.value/,
  );
  assert.match(attempt, /function rawText\(value: JsonValue\): string \| null/);
  assert.match(attempt, /if \(typeof value === "string"\) return value/);
  assert.match(
    pilotRpc,
    /recordKuzushijiObjectivePilotAttempt[\s\S]*?p_raw_answer: input\.request\.rawAnswer/,
  );
  assert.doesNotMatch(pilotRpc, /p_raw_answer:\s*JSON\.stringify/);
});

test("migration review note records the production root cause and alignment fix", () => {
  assert.match(migration, /Phase 4D-2 Objective RPC incorrectly required/i);
  assert.match(migration, /application contract allows a JSON string or a text\s+wrapper/i);
  assert.match(migration, /immutable application rawAnswer contract/i);
});
