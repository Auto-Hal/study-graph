import assert from 'node:assert/strict';
import test from 'node:test';
import { backupTables } from './backups/tables.mjs';
import { captureSql, packCapture, validateBackup } from './backups/core.mjs';
import { isolatedAdmin } from './backups/restore.mjs';

const empty = () => ({format:'study-graph-learning-backup',version:1,capturedAt:'2026-10-07T00:00:00.000000Z',serverVersion:'17',
  layout:Object.fromEntries(backupTables.map(({name,columns})=>[name,columns])),
  tables:Object.fromEntries(backupTables.map(({name})=>[name,[]]))});

test('restoration rejects hosted targets, URL options, and missing isolated opt-in', () => {
  for (const url of ['postgresql://postgres@db.example.com/postgres','postgresql://postgres@127.0.0.1/app',
    'postgresql://postgres@127.0.0.1/postgres?host=db.example.com','postgresql://postgres@127.0.0.1/postgres#ignored']) {
    assert.throws(()=>isolatedAdmin(url,'1'));
  }
  assert.throws(()=>isolatedAdmin('postgresql://postgres@127.0.0.1/postgres','0'));
});
test('backup rejects missing/extra tables and credential configuration', () => {
  const extra=empty();extra.tables['private.study_graph_config']=[{key:'app_token',value:'should-not-be-exported'}];
  assert.throws(()=>packCapture(extra));
  const missing=empty();delete missing.tables['private.objective_srs_opportunities'];assert.throws(()=>packCapture(missing));
  assert.doesNotMatch(captureSql(), /from\s+"private"\."study_graph_config"|from\s+"auth"/i);
});
test('backup rejects schema drift and changed rows before restoring', () => {
  const drift=structuredClone(empty());drift.layout['public.review_state'][0].type='uuid';assert.throws(()=>packCapture(drift));
  const backup=packCapture(empty());backup.capture.tables['public.review_state'].push({item_id:'altered'});
  assert.throws(()=>validateBackup(backup));
  const checksum=packCapture(empty());checksum.integrity.sha256='0'.repeat(64);assert.throws(()=>validateBackup(checksum));
});
test('backup pins migrations and excludes credentials carried in failed sync details', () => {
  const backup=packCapture(empty());backup.migrations[0].sha256='f'.repeat(64);assert.throws(()=>validateBackup(backup));
  const columns=backupTables.find(({name})=>name==='private.project_snapshot_sync_state').columns;
  const row=Object.fromEntries(columns.map(({name})=>[name,null]));row.project_id='kuzushiji';row.current_generation='0';row.next_generation='1';
  row.last_error_detail='sensitive-error-detail';const capture=empty();capture.tables['private.project_snapshot_sync_state']=[row];
  assert.throws(()=>packCapture(capture));
});
