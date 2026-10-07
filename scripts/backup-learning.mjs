import { execFileSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { captureSql, packCapture, validateBackup, summarizeCapture, root } from './backups/core.mjs';

// This tool reads only. It never loads application .env files or runs a restore.
const [mode, input] = process.argv.slice(2);
async function save(capture) {
  let commit = null;
  try { commit = execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  const backup = packCapture(capture, commit);
  const folder = fileURLToPath(new URL('.tools/learning-backups/', root));
  await mkdir(folder, { recursive: true });
  const repo = await realpath(fileURLToPath(root));
  const resolved = await realpath(folder);
  if (!resolved.startsWith(repo + path.sep)) throw new Error('Backup directory must stay in this checkout');
  const file = path.join(resolved, capture.capturedAt.replace(/[^0-9]/g,'') + '-' + backup.integrity.sha256.slice(0,12) + '.learning-backup.json');
  await writeFile(file, JSON.stringify(backup) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: true, file, sha256: backup.integrity.sha256, tables: summarizeCapture(capture) }));
}
function readJson(file) {
  if (!file || statSync(file).size > 50 * 1024 * 1024) throw new Error('Missing or oversized backup');
  return JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
}
try {
  if (mode === 'sql') process.stdout.write('-- Read-only capture. No credentials, leases, auth tables, or SQL restore commands.\n' + captureSql() + '\n');
  else if (mode === 'pack') {
    const raw = readJson(input);
    const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
    await save(value.capture ?? value);
  } else if (mode === 'inspect') {
    const backup = validateBackup(readJson(input));
    console.log(JSON.stringify({ ok: true, capturedAt: backup.capture.capturedAt, sha256: backup.integrity.sha256, tables: summarizeCapture(backup.capture) }));
  } else if (mode === 'export') {
    const url = new URL(process.env.STUDY_GRAPH_BACKUP_DATABASE_URL ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL connection required');
    const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
    try {
      await client.connect();
      await client.query('begin isolation level repeatable read read only');
      const { rows } = await client.query(captureSql());
      await client.query('commit');
      await save(rows[0].capture);
    } finally { await client.end(); }
  } else throw new Error('Use sql, pack <capture.json>, inspect <backup.json>, or export with STUDY_GRAPH_BACKUP_DATABASE_URL');
} catch (error) {
  // Do not print connection URLs, SQL row values, answers, or credentials on failure.
  console.error(JSON.stringify({ ok: false, errorType: error.name, code: /^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : undefined,
    reason: error.name === 'AssertionError' ? 'Backup schema/integrity validation failed' : 'Backup operation failed; check input and connection settings' }));
  process.exitCode = 1;
}
