import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { promises as fs, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';
import { projects, learnerId, notionResponse, displaySnapshots } from './e2e/fixtures.mjs';

// PostgREST encodes PostgreSQL bigint as a JSON number. Match that transport;
// node-postgres normally exposes bigint as a string to protect large values.
pg.types.setTypeParser(20, (value) => {
  const number = Number(value); assert.ok(Number.isSafeInteger(number)); return number;
});

// All mutation is confined to a newly created localhost database. Never load dotenv.
assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, '1', 'Explicit isolated DB opt-in required');
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(admin.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(admin.hostname), 'Remote databases forbidden');
assert.equal(admin.pathname, '/postgres');
assert.equal(admin.search, '');
const root = fileURLToPath(new URL('../', import.meta.url));
const database = 'study_graph_e2e_' + randomBytes(6).toString('hex');
const testUrl = new URL(admin);
testUrl.pathname = '/' + database;
const appToken = 'e2e-app-token-only';
const serviceKey = 'e2e-service-key-only';
const workParent = path.join(root, '.tools', 'e2e-workspaces');
const workspace = path.join(workParent, database);
const appRoot = path.join(workspace, 'app');
const logPath = path.join(workspace, 'next.log');
let pool, server, next, log, databaseCreated = false, passed = false;
let fixtureRequests = 0;

function safeProcessEnv() {
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'COMSPEC', 'LANG', 'LC_ALL', 'CI', 'PLAYWRIGHT_BROWSERS_PATH']);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())));
}

function sql(source, db = database) {
  const env = { ...safeProcessEnv(), PGHOST: admin.hostname.replace(/[\[\]]/g, ''), PGPORT: admin.port || '5432',
    PGUSER: decodeURIComponent(admin.username), PGPASSWORD: decodeURIComponent(admin.password),
    PGDATABASE: db, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete env[key];
  const result = spawnSync(process.env.STUDY_GRAPH_TEST_PSQL ?? 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
    { input: source, encoding: 'utf8', env, timeout: 120_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function freePort() {
  const listener = createSocketServer();
  const port = await listen(listener);
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function eventually(check, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try { await check(); return; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(label, { cause: last });
}

// Minimal HTTP-to-SQL transport adapter, not a mock of grading or scheduling.
// PostgreSQL executes the repository's exact RPC functions under their real ACL.
async function rpc(name, body, key) {
  assert.match(name, /^study_graph_[a-z0-9_]+$/);
  assert.ok(key === serviceKey || key === 'e2e-publishable-key-only');
  const meta = await pool.query(`select p.pronargs, p.proargnames, p.proargtypes::oid[] as types,
    p.proretset from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1`, [name]);
  assert.equal(meta.rows.length, 1, 'RPC overloads are not supported by this test adapter');
  const { pronargs, proargnames, types } = meta.rows[0];
  const names = proargnames.slice(0, pronargs);
  const args = Object.keys(body);
  assert.ok(args.every((key) => names.includes(key)), 'Unknown RPC argument');
  const values = [], parameters = [];
  for (const key of args) {
    const index = names.indexOf(key);
    assert.match(key, /^p_[a-z0-9_]+$/);
    const type = (await pool.query('select format_type($1::oid, null) as type', [types[index]])).rows[0].type;
    assert.match(type, /^[a-z][a-z0-9_ ]*(\[\])?$/);
    values.push(type === 'jsonb' || type === 'json' ? JSON.stringify(body[key]) : body[key]);
    parameters.push(`${key} => $${values.length}::${type}`);
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(key === serviceKey ? 'set local role service_role' : 'set local role anon');
    const result = await client.query(`select * from public.${name}(${parameters.join(',')})`, values);
    await client.query('commit');
    return result.rows;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

async function copyApp() {
  await fs.mkdir(appRoot, { recursive: true });
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of new Set(tracked)) {
    if ((file.startsWith('.env') && file !== '.env.example') || file.startsWith('.tools/')) continue;
    const source = path.join(root, file);
    try { if (!(await fs.stat(source)).isFile()) continue; } catch { continue; }
    const dest = path.join(appRoot, file);
    assert.ok(dest.startsWith(appRoot + path.sep), 'Unsafe application copy path');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(source, dest);
  }
  await fs.symlink(path.join(root, 'node_modules'), path.join(appRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}
async function launchContext(profile, width = 390) {
  const context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width, height: width === 390 ? 844 : 1180 },
    serviceWorkers: 'block', locale: 'ja-JP', timezoneId: 'Asia/Tokyo', env: safeProcessEnv() });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === appUrl || url.protocol === 'data:' ? route.continue() : route.abort('blockedbyclient');
  });
  return context;
}
async function outbox(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('study-graph-attempt-outbox', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try { return await new Promise((resolve, reject) => {
      const request = db.transaction('attempt_outbox').objectStore('attempt_outbox').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  });
}
async function resetLearning() {
  await pool.query('truncate private.exercise_instances, private.objective_review_state, private.objective_srs_opportunities cascade');
}
async function checkSaved(project) {
  const attempts = (await pool.query('select attempt_id, instance_id, srs_applied from private.exercise_attempts')).rows;
  assert.equal(attempts.length, 1, 'One answer must produce exactly one attempt');
  assert.equal(attempts[0].srs_applied, true);
  const states = (await pool.query('select project_id, repetitions, due_at from private.objective_review_state')).rows;
  assert.equal(states.length, 1); assert.equal(states[0].project_id, project.id);
  assert.equal(states[0].repetitions, 1); assert.ok(states[0].due_at.getTime() > Date.now());
  const applications = await pool.query('select count(*)::int as count from private.objective_srs_applications');
  assert.equal(applications.rows[0].count, 1, 'Retries must not advance the schedule twice');
  return attempts[0];
}
async function answer(page, project, doubleClick = false) {
  await page.goto(appUrl + '/review');
  await page.locator(`a[href="/review/session?project=${project.id}"]`).last().click();
  await page.getByRole('textbox', { name: '回答', exact: true }).fill(project.answer);
  await page.getByRole('button', { name: '回答する', exact: true }).click();
  await page.locator('.answer-verdict.correct').waitFor();
  const grade = page.getByRole('button', { name: /^できた/ });
  if (doubleClick) await grade.dblclick(); else await grade.click();
}
let appUrl;
try {
  sql('create database ' + database + ';', 'postgres'); databaseCreated = true;
  sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$; create schema extensions;`);
  for (const file of readdirSync(path.join(root, 'supabase', 'migrations')).filter((file) => file.endsWith('.sql')).sort())
    sql(readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8'));
  pool = new pg.Pool({ connectionString: testUrl.href, max: 8, options: '-c plpgsql.variable_conflict=error' });
  await pool.query('insert into private.study_graph_config(key,value) values($1,$2)', ['app_token_sha256', createHash('sha256').update(appToken).digest('hex')]);
  server = createServer(async (request, response) => {
    try {
      let payload = ''; for await (const chunk of request) payload += chunk;
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      let result;
      if (pathname.startsWith('/notion/')) { fixtureRequests++; result = notionResponse(pathname); }
      else if (request.method === 'POST' && pathname.startsWith('/rest/v1/rpc/')) result = await rpc(pathname.split('/').at(-1), JSON.parse(payload), request.headers.apikey);
      else throw new Error('Unsupported fixture endpoint');
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: error.code ?? 'E2E_ADAPTER_ERROR', message: error.message }));
    }
  });
  const fixtureUrl = 'http://127.0.0.1:' + await listen(server);
  for (const snapshot of displaySnapshots()) {
    const columns = { snapshot_id: snapshot.snapshotId, project_id: snapshot.projectId, generation: snapshot.generation,
      schema_version: snapshot.schemaVersion, source_read_started_at: snapshot.sourceReadStartedAt,
      source_read_completed_at: snapshot.sourceReadCompletedAt, published_at: snapshot.publishedAt, valid_until: snapshot.validUntil,
      scope_policy_version: snapshot.scopePolicyVersion, knowledge_projection_version: snapshot.knowledgeProjectionVersion,
      source_evidence: snapshot.sourceEvidence, scope_decisions: snapshot.scopeDecisions,
      knowledge_projection: snapshot.knowledgeProjection, content_hash: snapshot.contentHash };
    const values = Object.values(columns).map((value) => typeof value === 'object' ? JSON.stringify(value) : value);
    await pool.query(`insert into private.scope_knowledge_snapshots(${Object.keys(columns).join(',')}) values(${values.map((_, i) => '$' + (i + 1)).join(',')})`, values);
    await pool.query('insert into private.project_snapshot_sync_state(project_id,current_snapshot_id,current_generation,next_generation) values($1,$2,1,2)', [snapshot.projectId, snapshot.snapshotId]);
  }
  await copyApp();
  appUrl = 'http://127.0.0.1:' + await freePort();
  const env = safeProcessEnv();
  Object.assign(env, { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', SUPABASE_URL: fixtureUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key-only',
    STUDY_GRAPH_APP_TOKEN: appToken, STUDY_GRAPH_LEARNER_ID: learnerId, NOTION_TOKEN: 'e2e-notion-token-only',
    STUDY_GRAPH_PILOT_ISSUANCE_ENABLED: 'true', STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED: 'true',
    STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED: 'true', STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED: 'true',
    NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED: 'false', STUDY_GRAPH_E2E_FIXTURE_URL: fixtureUrl, STUDY_GRAPH_E2E_APP_URL: appUrl,
    NODE_OPTIONS: '--require=' + JSON.stringify(path.join(root, 'scripts', 'e2e', 'network-guard.cjs')) });
  log = await fs.open(logPath, 'w');
  next = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', new URL(appUrl).port],
    { cwd: appRoot, env, stdio: ['ignore', log.fd, log.fd], windowsHide: true, detached: process.platform !== 'win32' });
  await eventually(async () => { assert.equal(next.exitCode, null); assert.equal((await fetch(appUrl + '/review')).status, 200); }, 'Isolated app did not start', 120_000);
  console.log('PASS isolated app + exact migrations + localhost RPC transport ready');
  for (const width of [390, 820]) for (const project of projects) {
    await resetLearning();
    const context = await launchContext(path.join(workspace, 'profiles', project.id + '-' + width), width);
    try {
      const page = context.pages()[0];
      await answer(page, project);
      await page.getByText('回答と評価を保存し、次回復習日を更新しました。', { exact: true }).waitFor();
      await checkSaved(project);
      const dueAt = (await pool.query('select due_at from private.objective_review_state')).rows[0].due_at;
      const expectedDate = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dueAt);
      assert.equal(await page.locator('.result-grid > div').filter({ hasText: '最短の次回復習' }).locator('strong').innerText(), expectedDate);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal overflow');
      await page.screenshot({ path: path.join(workspace, `${project.id}-${width}.png`), fullPage: true });
      console.log(`PASS ${project.id} ${width}px: answer → API → PostgreSQL → receipt + next date`);
    } finally { await context.close(); }
  }
  for (const project of projects) for (const failure of ['double-click', 'before-send', 'after-acceptance']) {
    await resetLearning();
    const profile = path.join(workspace, 'profiles', project.id + '-' + failure);
    let context = await launchContext(profile);
    let attempted = false, submission;
    try {
      let page = context.pages()[0];
      if (failure !== 'double-click') await context.route('**/api/review/pilot/**', async (route) => {
        if (new URL(route.request().url()).pathname === '/api/review/pilot/attempt' && !attempted) {
          submission = route.request().postDataJSON();
          if (failure === 'after-acceptance') { const response = await route.fetch(); assert.equal(response.status(), 200); }
          attempted = true;
        }
        await route.abort('internetdisconnected');
      });
      await answer(page, project, failure === 'double-click');
      if (failure !== 'double-click') {
        await eventually(async () => { assert.equal(attempted, true); const entries = await outbox(page); assert.equal(entries.length, 1); }, 'Durable pending answer missing');
        const entries = await outbox(page);
        const attemptId = entries[0].attemptId;
        assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count, failure === 'before-send' ? 0 : 1);
        await context.close(); context = await launchContext(profile); page = context.pages()[0];
        // Reopening the persisted browser profile restores IndexedDB. The app's
        // existing session hook must reconcile/resend; the test does not flush it.
        await page.goto(appUrl + '/review/session?project=' + project.id);
        await eventually(async () => { const row = await checkSaved(project); assert.equal(row.attempt_id, attemptId); }, `${project.id}: restart did not recover ${failure}`);
        await eventually(async () => { const entries = await outbox(page); assert.match(entries[0].record.status, /^accepted-/); }, 'Receipt did not reconcile durable outbox');
        // Replaying the original request also checks the server's idempotent API.
        const response = await page.request.post(appUrl + '/api/review/pilot/attempt', { data: submission, headers: { Origin: appUrl } });
        assert.equal(response.status(), 200); await checkSaved(project);
      } else {
        await page.getByText('回答と評価を保存し、次回復習日を更新しました。', { exact: true }).waitFor();
        await checkSaved(project);
      }
      console.log(`PASS ${project.id}: ${failure}, one history entry and one SRS application`);
    } finally { await context.close(); }
  }
  assert.ok(fixtureRequests > 0, 'App did not read fixed Notion Scope');
  passed = true;
  console.log('PASS 15 browser scenarios; no hosted credentials or production database used');
} catch (error) {
  console.error(error);
  console.error('Isolated E2E artifacts: ' + workspace);
  process.exitCode = 1;
} finally {
  if (next && next.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-next.pid, 'SIGTERM'); } catch {} }
    await Promise.race([new Promise((resolve) => { if (next.exitCode !== null) resolve(); else next.once('exit', resolve); }), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  if (log) await log.close();
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (pool) await pool.end();
  if (databaseCreated) sql('drop database ' + database + ' with (force);', 'postgres');
  if (passed) console.log('Isolated app stopped; disposable database removed. Screenshots retained: ' + workspace);
}
