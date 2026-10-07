import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import pg from 'pg';
import { backupTables } from './tables.mjs';
import { captureSql, migrations, relation, summarizeCapture, validateBackup, root } from './core.mjs';

export function isolatedAdmin(raw = process.env.STUDY_GRAPH_TEST_DATABASE_URL, optIn = process.env.STUDY_GRAPH_ISOLATED_DB) {
  assert.equal(optIn, '1', 'Explicit isolated DB opt-in required');
  const url = new URL(raw ?? '');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname), 'Remote restore forbidden');
  assert.equal(url.pathname, '/postgres'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  return url;
}
function clientFor(url, database) {
  return new pg.Client({ host: url.hostname.replace(/[\[\]]/g,''), port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database,
    ssl: false, options: '', connectionTimeoutMillis: 5000, statement_timeout: 60000 });
}
export async function withDisposableDatabase(run) {
  const url = isolatedAdmin();
  const name = 'study_graph_restore_' + randomBytes(8).toString('hex');
  assert.match(name, /^study_graph_restore_[a-f0-9]{16}$/);
  const admin = clientFor(url, 'postgres'), client = clientFor(url, name);
  let created = false;
  await admin.connect();
  try {
    await admin.query('create database ' + name); created = true;
    await client.connect();
    await client.query(`do $$ begin
      if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$; create schema extensions;`);
    for (const { name: file } of migrations()) await client.query(readFileSync(new URL('supabase/migrations/' + file, root),'utf8'));
    return await run(client, name);
  } finally {
    await client.end();
    if (created) await admin.query('drop database ' + name);
    await admin.end();
  }
}
export async function capture(client) {
  await client.query('begin isolation level repeatable read read only');
  try {
    const { rows } = await client.query(captureSql());
    await client.query('commit'); return rows[0].capture;
  } catch (error) { await client.query('rollback'); throw error; }
}

/** Internal primitive; CLI exposes only newly created, disposable localhost DBs. */
export async function restore(client, backup) {
  validateBackup(backup);
  await client.query('begin');
  try {
    const current = (await client.query(captureSql())).rows[0].capture;
    assert.ok(Object.values(current.tables).every((rows) => rows.length === 0), 'Restore destination must be empty');
    assert.deepEqual(current.layout, backup.capture.layout, 'Destination schema drift');
    for (const table of backupTables) {
      const columns = table.columns.map(({ name }) => '"' + name + '"').join(',');
      await client.query(`insert into ${relation(table.name)} (${columns})
        select ${columns} from jsonb_populate_recordset(null::${relation(table.name)}, $1::jsonb)`, [JSON.stringify(backup.capture.tables[table.name])]);
    }
    // Sequence must continue beyond every restored history ID, including values >2^53.
    await client.query(`select setval(pg_get_serial_sequence('public.review_attempts','id'),
      coalesce((select max(id) from public.review_attempts),1), exists(select from public.review_attempts))`);
    const restored = (await client.query(captureSql())).rows[0].capture;
    assert.deepEqual(summarizeCapture(restored), summarizeCapture(backup.capture), 'Restored rows/checksums differ');
    await client.query('commit');
    return restored;
  } catch (error) { await client.query('rollback'); throw error; }
}

export async function verifyBackupFile(file) {
  assert.ok(statSync(file).size <= 50 * 1024 * 1024);
  const backup = validateBackup(JSON.parse(readFileSync(file, 'utf8')));
  return withDisposableDatabase(async (client) => {
    const restored = await restore(client, backup);
    const objectiveStates = restored.tables['private.objective_review_state'];
    const learners = [...new Set(objectiveStates.map((row) => row.learner_id))];
    let schedules = 0, receipts = 0;
    await client.query('begin read only; set local role service_role');
    try {
      for (const learner of learners) {
        const { rows } = await client.query('select * from public.study_graph_objective_review_schedule($1::uuid)', [learner]);
        const expected = objectiveStates.filter((row) => row.learner_id === learner && ['kuzushiji','philosophy','western-art-history'].includes(row.project_id));
        assert.equal(rows.length, expected.length);
        for (const row of rows) {
          const state = expected.find((s) => s.project_id === row.project_id && s.objective_id === row.objective_id && s.srs_epoch === row.srs_epoch);
          assert.ok(state); assert.equal(row.due_at.toISOString(), new Date(state.due_at).toISOString());
        }
        schedules += rows.length;
      }
      for (const attempt of restored.tables['private.exercise_attempts']) {
        const { rows } = await client.query('select * from public.study_graph_get_kuzushiji_pilot_attempt_receipt($1::uuid,$2::uuid)',
          [attempt.instance_id, attempt.learner_id]);
        assert.equal(rows.length, 1); assert.equal(rows[0].attempt_id, attempt.attempt_id);
        assert.equal(rows[0].request_hash, attempt.request_hash); assert.deepEqual(rows[0].receipt, attempt.receipt);
        receipts++;
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    return { ok: true, sha256: backup.integrity.sha256, capturedAt: restored.capturedAt,
      tables: summarizeCapture(restored), objectiveSchedulesRead: schedules, acceptedReceiptsRead: receipts, destination: 'disposable localhost', sourceWritten: false };
  });
}
