import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, '1');
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(admin.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(admin.hostname));
assert.equal(admin.pathname, '/postgres'); assert.equal(admin.search, '');
const db = 'study_graph_schedule_' + randomBytes(6).toString('hex');
function sql(text, database = db, success = true) {
  const env = { ...process.env, PGHOST: admin.hostname, PGPORT: admin.port || '5432', PGUSER: decodeURIComponent(admin.username), PGPASSWORD: decodeURIComponent(admin.password), PGDATABASE: database, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5' };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete env[key];
  const result = spawnSync(process.env.STUDY_GRAPH_TEST_PSQL ?? 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', env, timeout: 120000, windowsHide: true });
  if (success) assert.equal(result.status, 0, result.stderr || String(result.error));
  else assert.notEqual(result.status, 0, 'Expected privilege denial');
  return result.stdout.trim();
}
const learner = '22222222-2222-4222-8222-222222222222';
const other = '99999999-9999-4999-8999-999999999999';
const signature = 'public.study_graph_objective_review_schedule(uuid)';
sql('create database ' + db, 'postgres');
try {
  sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$; create schema extensions;`);
  for (const name of readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((file) => file.endsWith('.sql')).sort()) sql(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  const meta = JSON.parse(sql(`select json_build_object('definer',prosecdef,'volatility',provolatile,'config',proconfig,'publicExecute',exists(select from aclexplode(proacl) a where a.grantee=0 and a.privilege_type='EXECUTE')) from pg_proc where oid='${signature}'::regprocedure;`));
  assert.equal(meta.definer, true); assert.equal(meta.volatility, 's'); assert.deepEqual(meta.config, ['search_path=pg_catalog']); assert.equal(meta.publicExecute, false);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(sql(`select has_function_privilege('${role}','${signature}','EXECUTE')`), role === 'service_role' ? 't' : 'f');
    assert.equal(sql(`select has_table_privilege('${role}','private.objective_review_state','SELECT')`), 'f');
    sql(`set role ${role}; select * from private.objective_review_state`, db, false);
    if (role !== 'service_role') sql(`set role ${role}; select * from public.study_graph_objective_review_schedule('${learner}')`, db, false);
  }
  sql(`insert into private.objective_review_state(learner_id,project_id,objective_id,srs_epoch,last_grade,repetitions,interval_days,last_reviewed_at,due_at,scheduler_version)
    select owner::uuid,project,'target',epoch,'good',1,1,now()-interval '1 day',now()+interval '1 day','test'
    from (values ('${learner}','kuzushiji',1),('${learner}','philosophy',1),('${learner}','western-art-history',1),('${learner}','philosophy',2),('${other}','philosophy',1),('${learner}','unrelated',1)) v(owner,project,epoch);`);
  const snapshot = () => sql(`select md5(string_agg(row_to_json(r)::text,'' order by row_to_json(r)::text)) from private.objective_review_state r`);
  const before = snapshot();
  const read = (owner) => JSON.parse(sql(`begin read only; set local role service_role; select coalesce(json_agg(r),'[]'::json) from public.study_graph_objective_review_schedule('${owner}') r; commit;`));
  const rows = read(learner);
  assert.equal(rows.length, 4); assert.deepEqual(Object.keys(rows[0]), ['project_id','objective_id','srs_epoch','due_at']);
  assert.deepEqual(rows.filter((row) => row.project_id === 'philosophy').map((row) => row.srs_epoch), [1,2]);
  assert.equal(read(other).length, 1); assert.deepEqual(read('11111111-1111-4111-8111-111111111111'), []);
  assert.equal(snapshot(), before);
  assert.equal(sql('select count(*) from private.exercise_instances'), '0');
  assert.equal(sql('select count(*) from private.exercise_attempts'), '0');
  console.log('PASS review schedule RPC: three projects, learner/epoch separation, service-only ACL, read-only transaction and no learning writes');
} finally { assert.match(db, /^study_graph_schedule_[a-f0-9]{12}$/); sql('drop database ' + db, 'postgres'); }
