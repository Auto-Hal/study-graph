import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { backupTables } from './tables.mjs';

export const backupFormat = 'study-graph-learning-backup';
export const backupVersion = 1;
export const root = new URL('../../', import.meta.url);
const clearedSyncFields = new Set(['active_run_id', 'active_generation', 'active_started_at',
  'active_lease_until', 'last_error_code', 'last_error_detail']);
const ident = (value) => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return '"' + value + '"'; };
export const relation = (table) => table.split('.').map(ident).join('.');

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function tableDigest(rows) { return digest(rows.map(canonical).sort()); }
export function migrations() {
  const folder = new URL('supabase/migrations/', root);
  return readdirSync(folder).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort()
    .map((name) => ({ name, sha256: createHash('sha256').update(readFileSync(new URL(name, folder), 'utf8').replaceAll('\r\n', '\n')).digest('hex') }));
}

/** One SELECT = one PostgreSQL statement snapshot, including every FK dependency. */
export function captureSql() {
  const data = backupTables.map((table, index) => {
    const columns = table.columns.map(({ name, type }) => {
      const col = 'r.' + ident(name);
      const value = table.name === 'private.project_snapshot_sync_state' && clearedSyncFields.has(name) ? 'null'
        : type === 'int8' ? col + '::text'
        : type === 'timestamptz' ? `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` : col;
      return value + ' as ' + ident(name);
    }).join(', ');
    return `t${index} as (select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text), '[]'::jsonb) as rows from (select ${columns} from ${relation(table.name)} r) v)`;
  });
  const names = backupTables.map(({ name }) => `'${name}'`).join(',');
  return `with ${data.join(',\n')}, layout as (
  select jsonb_object_agg(name, columns) as value from (
    select table_schema || '.' || table_name as name,
      jsonb_agg(jsonb_build_object('name',column_name,'type',udt_name) order by ordinal_position) as columns
    from information_schema.columns where table_schema || '.' || table_name in (${names})
    group by table_schema, table_name
  ) c
)
select jsonb_build_object('format','${backupFormat}', 'version',${backupVersion},
  'capturedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'serverVersion',current_setting('server_version'), 'layout',(select value from layout),
  'tables',jsonb_build_object(${backupTables.map(({ name }, i) => `'${name}',(select rows from t${i})`).join(',\n')})) as capture;`;
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
}
export function validateCapture(capture) {
  exactKeys(capture, ['format','version','capturedAt','serverVersion','layout','tables'], 'Capture fields');
  assert.equal(capture.format, backupFormat); assert.equal(capture.version, backupVersion);
  assert.ok(Number.isFinite(Date.parse(capture.capturedAt)), 'Capture timestamp');
  assert.equal(typeof capture.serverVersion, 'string');
  const names = backupTables.map(({ name }) => name);
  exactKeys(capture.layout, names, 'Unknown or missing table layout');
  exactKeys(capture.tables, names, 'Unknown or missing table data');
  let total = 0;
  for (const table of backupTables) {
    assert.deepEqual(capture.layout[table.name], table.columns, `Schema drift: ${table.name}`);
    const rows = capture.tables[table.name];
    assert.ok(Array.isArray(rows), 'Table must be an array'); total += rows.length;
    assert.ok(total <= 100000, 'Backup row limit exceeded');
    const keys = new Set();
    for (const row of rows) {
      exactKeys(row, table.columns.map(({ name }) => name), `Row layout: ${table.name}`);
      for (const { name, type } of table.columns) {
        if (type === 'int8' && row[name] !== null) assert.match(row[name], /^-?\d+$/, 'Bigint must remain lossless text');
      }
      if (table.name === 'private.project_snapshot_sync_state') {
        for (const field of clearedSyncFields) assert.equal(row[field], null, 'Running lease/error detail must be excluded');
      }
      const key = canonical(table.keys.map((name) => row[name]));
      assert.ok(!keys.has(key), `Duplicate key: ${table.name}`); keys.add(key);
    }
  }
  return capture;
}
export function summarizeCapture(capture) {
  validateCapture(capture);
  return Object.fromEntries(backupTables.map(({ name }) => [name, {
    rows: capture.tables[name].length, sha256: tableDigest(capture.tables[name]),
  }]));
}
export function packCapture(capture, sourceCommit = null) {
  validateCapture(capture);
  assert.ok(sourceCommit === null || /^[0-9a-f]{40}$/.test(sourceCommit));
  const payload = { capture, migrations: migrations(), sourceCommit };
  return { ...payload, integrity: { algorithm: 'sha256', sha256: digest(payload) } };
}
export function validateBackup(backup) {
  exactKeys(backup, ['capture','migrations','sourceCommit','integrity'], 'Backup fields');
  validateCapture(backup.capture);
  exactKeys(backup.integrity, ['algorithm','sha256'], 'Integrity fields');
  assert.equal(backup.integrity.algorithm, 'sha256');
  const payload = { capture: backup.capture, migrations: backup.migrations, sourceCommit: backup.sourceCommit };
  assert.equal(backup.integrity.sha256, digest(payload), 'Backup checksum mismatch');
  assert.deepEqual(backup.migrations, migrations(), 'Restore requires exactly the backed-up migration files');
  assert.ok(backup.sourceCommit === null || /^[0-9a-f]{40}$/.test(backup.sourceCommit));
  return backup;
}
