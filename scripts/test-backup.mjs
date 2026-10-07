import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { verifyBackupFile } from './backups/restore.mjs';
import { root } from './backups/core.mjs';

try {
  if (process.env.STUDY_GRAPH_BACKUP_FILE) {
    const report = await verifyBackupFile(process.env.STUDY_GRAPH_BACKUP_FILE);
    const folder = new URL('.tools/learning-backups/', root);
    await mkdir(folder, { recursive: true });
    const file = new URL(report.sha256 + '.restore-report.json', folder);
    await writeFile(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report));
    console.log('PASS backup restored with all constraints active; rows/checksums and schedule RPC matched; disposable DB removed');
  } else {
    const result = spawnSync(process.execPath, ['--experimental-strip-types','scripts/learning-backup-db.test.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, errorType: error.name,
    code: /^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : undefined,
    reason: 'Isolated backup restore verification failed; source database was not modified' }));
  process.exitCode = 1;
}
