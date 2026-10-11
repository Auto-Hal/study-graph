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
import { projects, learnerId, notionResponse, displaySnapshots, setUnitFixtures } from './e2e/fixtures.mjs';
import { verifyUnitDrafts } from './e2e/unit-drafts.mjs';

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
let scheduleReadFailure = false, scopeReadFailure = false, historyReadFailure = false;

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
    const isHistory = name === 'study_graph_learning_history';
    const result = await client.query(`select ${isHistory ? 'to_jsonb(history_row) as data' : '*'} from public.${name}(${parameters.join(',')}) history_row`, values);
    await client.query('commit');
    return isHistory ? result.rows.map(row => row.data) : result.rows;
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
async function learningFingerprint() {
  const tables = (await pool.query("select tablename from pg_tables where schemaname='private' order by tablename")).rows;
  const rows = [];
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z][a-z0-9_]+$/);
    rows.push((await pool.query(`select md5(coalesce(string_agg(row_to_json(r)::text,'' order by row_to_json(r)::text),'')) as hash from private.${tablename} r`)).rows[0].hash);
  }
  return rows;
}
async function checkEntry(page, project, due, unseen) {
  const entry = page.locator(`[data-review-project="${project.id}"]`);
  await entry.waitFor();
  assert.equal(await entry.getAttribute('data-review-status'), 'ready');
  assert.equal(await entry.locator('.phase5-review-entry-counts').innerText(), `復習 ${due}問\n未学習 ${unseen}問`);
  return entry;
}
async function stopApp() {
  if (!next || next.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-next.pid, 'SIGTERM'); } catch {} }
  await Promise.race([new Promise((resolve) => { if (next.exitCode !== null) resolve(); else next.once('exit', resolve); }), new Promise((resolve) => setTimeout(resolve, 5000))]);
}
async function startApp(env) {
  next = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', new URL(appUrl).port],
    { cwd: appRoot, env, stdio: ['ignore', log.fd, log.fd], windowsHide: true, detached: process.platform !== 'win32' });
  await eventually(async () => { assert.equal(next.exitCode, null); assert.equal((await fetch(appUrl + '/review')).status, 200); }, 'Isolated app did not start', 120_000);
}
async function answer(page, project, doubleClick = false) {
  await page.goto(appUrl + '/review');
  await page.locator(`a[href="/review/session?project=${project.id}"]`).last().click();
  const input = page.getByRole('textbox', { name: '回答', exact: true });
  // Streamed HTML can expose the input before its client handlers are ready.
  // Repeat only the unsaved input operation; never retry submission or grading here.
  await eventually(async () => {
    await input.fill(''); await input.fill(project.answer);
    assert.equal(await page.getByRole('button', { name: '回答する', exact: true }).isEnabled(), true);
  }, 'Answer input did not become interactive');
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
      if (pathname.startsWith('/notion/')) { fixtureRequests++; if (scopeReadFailure) throw new Error('Fixture scope unavailable'); result = notionResponse(pathname); }
      else if (request.method === 'POST' && pathname.startsWith('/rest/v1/rpc/')) { if (scheduleReadFailure && pathname.endsWith('/study_graph_objective_review_schedule')) throw new Error('Fixture schedule unavailable'); if (historyReadFailure && pathname.endsWith('/study_graph_learning_history')) throw new Error('Fixture history unavailable'); result = await rpc(pathname.split('/').at(-1), JSON.parse(payload), request.headers.apikey); }
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
  await startApp(env);
  console.log('PASS isolated app + exact migrations + localhost RPC transport ready');
  for (const width of [390, 820]) {
    const context = await launchContext(path.join(workspace, 'profiles', 'entry-' + width), width);
    try {
      const page = context.pages()[0], before = await learningFingerprint();
      for (const route of ['/', '/review']) {
        await page.goto(appUrl + route);
        for (const project of projects) await checkEntry(page, project, 0, 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        assert.deepEqual(await learningFingerprint(), before, 'Entry must not create archives/instances/answers or update schedules');
      }
      await page.screenshot({ path: path.join(workspace, 'review-entry-' + width + '.png'), fullPage: true });
      console.log(`PASS entry ${width}px: three equal unseen counts, both routes read-only`);
    } finally { await context.close(); }
  }
  for (const failure of ['schedule', 'scope']) {
    const context = await launchContext(path.join(workspace, 'profiles', 'entry-failure-' + failure));
    try {
      const before = await learningFingerprint();
      scheduleReadFailure = failure === 'schedule'; scopeReadFailure = failure === 'scope';
      const page = context.pages()[0]; await page.goto(appUrl + '/review');
      for (const project of projects) {
        const entry = page.locator(`[data-review-project="${project.id}"]`); await entry.waitFor();
        assert.equal(await entry.getAttribute('data-review-status'), 'unavailable');
        assert.equal(await entry.locator('.phase5-review-entry-counts').count(), 0);
      }
      assert.deepEqual(await learningFingerprint(), before);
      console.log(`PASS entry ${failure} failure: unknown remains unknown for three subjects`);
    } finally { scheduleReadFailure = false; scopeReadFailure = false; await context.close(); }
  }
  {
    const context = await launchContext(path.join(workspace,'profiles','empty-history'));
    try { const page=context.pages()[0];const before=await learningFingerprint();await page.goto(appUrl+'/history');await page.getByRole('heading',{name:'保存済みの回答はまだありません',exact:true}).waitFor();assert.equal(await page.locator('main').getAttribute('data-history-state'),'ready');assert.deepEqual(await learningFingerprint(),before);console.log('PASS history empty state: successful read is distinct from unavailable and no writes'); }
    finally {await context.close();}
  }

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
      if (width === 390) {
        let before = await learningFingerprint();
        await page.goto(appUrl + '/');
        const entry = await checkEntry(page, project, 0, 0);
        assert.ok((await entry.innerText()).includes('次回の復習 ' + expectedDate));
        assert.equal(await entry.locator('a[href^="/review/session"]').count(), 0);
        assert.deepEqual(await learningFingerprint(), before);
        // Make the real saved state due in the disposable DB; the API issuer,
        // rather than the browser fixture, decides whether it can be issued.
        await pool.query("update private.objective_review_state set due_at=now()-interval '1 minute'");
        before = await learningFingerprint();
        await page.goto(appUrl + '/review'); await checkEntry(page, project, 1, 0);
        assert.deepEqual(await learningFingerprint(), before);
        await page.locator(`[data-review-project="${project.id}"] a[href^="/review/session"]`).click();
        await page.getByRole('textbox', { name: '回答', exact: true }).waitFor();
        console.log(`PASS ${project.id}: saved future → next date; due → one actual issued question`);
      }
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
  // Hold the navigation request before it reaches the server. The deliberate
  // click must be acknowledged without issuing a question or saving an answer.
  for (const project of projects) {
    await resetLearning();
    const context = await launchContext(path.join(workspace, 'profiles', 'start-feedback-' + project.id));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let observed;
    const requested = new Promise((resolve) => { observed = resolve; });
    try {
      const page = context.pages()[0];
      await page.goto(appUrl + '/review');
      for (const candidate of projects) await checkEntry(page, candidate, 0, 1);
      const before = await learningFingerprint();
      await page.route('**/review/session?*', async (route) => {
        observed(); await gate; await route.continue();
      });
      const entry = page.locator('[data-review-project="' + project.id + '"]');
      const click = entry.getByRole('link', { name: /^取り組む/ }).click();
      await requested;
      await entry.locator('[data-review-start-pending="true"]').waitFor();
      await entry.getByRole('status').filter({ hasText: '準備中…' }).waitFor();
      assert.deepEqual(await learningFingerprint(), before, 'Pending feedback must not issue or save');
      release(); await click;
      await page.locator('.answer-entry').waitFor();
      assert.equal((await pool.query('select count(*)::int as count from private.exercise_instances')).rows[0].count, 1);
      assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count, 0);
      console.log('PASS start feedback ' + project.id + ': immediate pending, deliberate single issuance, no answer');
    } finally { release(); await context.close(); }
  }
  const units = [
    { id: 'kuzushiji-kana-1', project: projects[0], answers: ['あ','い','う','い','あ','う'] },
    { id: 'art-prehistory-1', project: projects[2], answers: ['旧石器時代','誇張','抽象化','France','スペイン王国','石灰石','胸やお腹を大きく表している。豊かさを願う像かもしれないが、用途は決まっていない。'] },
    { id: 'philosophy-arche-1', project: projects[1], answers: ['水','アペイロン','空気','世界の多様なものに共通する元を、自然の側から考えた。','水は特定のものだが、アペイロンは性質を限定しない根源だ。','空気が薄まったり、濃く集まったりして、違う物が生じると考えた。'] },
    { id:'kuzushiji-kana-2', project:projects[0], answers:['あ','う','い','あ','い','う'] },
    { id:'art-megaliths-2', project:projects[2], answers:['Stonehenge','メンヒル','ドルメン','クロムレック','トリリトン','England','新石器時代後期','埋葬の跡があり、共同体が儀礼を共有する場所だった可能性もある。観測だけが使い道とは決められない。'] },
    { id:'philosophy-change-2', project:projects[1], answers:['ヘラクリトス','Parmenides','Logos','水は入れ替わるが、流れる道や流れが続くことから同じ川と呼べる。','変わり方にも共通の仕組みがあるので、ばらばらの混乱とは違う。','どちらも世界のあり方を問う。ヘラクレイトスは秩序ある変化を、パルメニデスは本当にあるものの不変を考える。','何もないところからあるものは出てこず、あるものが完全な無にもならないので、真の存在は生成・消滅しない。'] },
  ];
  async function schedules() {
    return (await pool.query('select to_jsonb(s) as value from private.objective_review_state s order by objective_id')).rows;
  }
  async function unitAnswer(page, answer, rubric = false, doubleClick = false) {
    assert.equal(await page.locator('.glyph-comparison').count(), 0, 'Comparison must remain hidden before the answer');
    await page.getByRole('textbox', { name: '回答', exact: true }).fill(answer);
    await page.getByRole('button', { name: '回答する', exact: true }).click();
    if (rubric) {
      await page.getByText('要点を確認して自己評価', { exact: true }).waitFor();
      assert.equal(await page.locator('.answer-verdict.incorrect').count(), 0, 'Explanation must not be exact-match graded');
      for (const label of ['必要な要点','許容する言い換え','重大な誤解']) await page.getByRole('heading', { name: label, exact: true }).waitFor();
      await page.screenshot({ path: path.join(workspace, 'explanation-rubric-' + page.viewportSize().width + '.png'), fullPage: true });
    } else await page.locator('.answer-verdict.correct').waitFor();
    if (await page.locator('.glyph-comparison').count()) {
      assert.equal(await page.locator('.glyph-comparison img').count(), 2);
      await page.getByText('今回の字形',{exact:true}).waitFor();
      await page.getByText('前の単元の同じ読み',{exact:true}).waitFor();
      await eventually(async()=>assert.equal(await page.locator('.glyph-comparison img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),true),'Comparison images failed to load');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(workspace,'glyph-comparison-revealed-'+page.viewportSize().width+'.png'),fullPage:true});
    }
    const grade = page.getByRole('button', { name: /^できた/ });
    if (doubleClick) await grade.dblclick(); else await grade.click();
    await page.locator('.answer-panel').waitFor({ state: 'hidden' });
  }
  async function startUnit(page, unit) {
    await page.goto(appUrl + '/units/' + unit.id);
    assert.equal(await page.locator('[data-unit-id]').getAttribute('data-unit-status'), 'ready');
    await page.getByRole('button', { name: '単元を練習する', exact: true }).click();
    await page.getByRole('textbox', { name: '回答', exact: true }).waitFor();
  }
  for (const width of [390, 820]) for (const unit of units) {
    setUnitFixtures(false); await resetLearning();
    const context = await launchContext(path.join(workspace, 'profiles', unit.id + '-' + width), width);
    try {
      const page = context.pages()[0];
      // Preserve a real pre-existing future SRS state through the entire unit.
      await answer(page, unit.project);
      await page.getByText('回答と評価を保存し、次回復習日を更新しました。', { exact: true }).waitFor();
      const beforeSchedule = await schedules(); setUnitFixtures(true);
      const before = await learningFingerprint();
      await page.goto(appUrl + '/units');
      assert.equal(await page.locator('.unit-list-card').count(), 6);
      await page.goto(appUrl + '/units/' + unit.id);
      assert.equal(await page.locator('[data-unit-id]').getAttribute('data-unit-status'), 'ready');
      assert.deepEqual(await learningFingerprint(), before, 'Unit overview must be read-only');
      if (width === 390) {
        const crossOrigin = await page.request.post(appUrl + '/api/units/start', { data: {unitId:unit.id}, headers:{Origin:'https://unrelated.example'} });
        assert.equal(crossOrigin.status(),403);
        const unknown = await page.request.post(appUrl + '/api/units/start', { data:{unitId:'not-a-unit'},headers:{Origin:appUrl} });
        assert.equal(unknown.status(),400); assert.deepEqual(await learningFingerprint(),before);
      }
      await page.getByRole('button', { name: '単元を練習する', exact: true }).click();
      for (let i = 0; i < unit.answers.length; i++) {
        await page.getByRole('textbox', { name: '回答', exact: true }).waitFor();
        const rubric = await page.locator('textarea').count() > 0;
        await page.getByRole('textbox', { name: '回答', exact: true }).fill(unit.answers[i]);
        if (rubric) await page.screenshot({ path: path.join(workspace, `${unit.id}-explain-${width}.png`), fullPage: true });
        await unitAnswer(page, unit.answers[i], rubric);
        if (rubric) {
          const stored = (await pool.query('select grading_status,is_correct,self_evaluation,raw_answer from private.exercise_attempts order by submitted_at desc limit 1')).rows[0];
          assert.equal(stored.grading_status,'ungraded'); assert.equal(stored.is_correct,null);
          assert.equal(stored.self_evaluation,'good'); assert.equal(stored.raw_answer,unit.answers[i]);
        }
      }
      await page.getByText('回答と自己評価を保存しました。単元練習は復習予定を変更しません。', {exact:true}).waitFor();
      assert.equal(await page.locator('.unit-result-list li').count(), unit.answers.length);
      assert.deepEqual(await schedules(),beforeSchedule,'Practice must not move an existing SRS state');
      const attempts=(await pool.query('select * from private.exercise_attempts')).rows;
      assert.equal(attempts.length,unit.answers.length+1);
      assert.equal(attempts.filter(a=>a.srs_applied).length,1);
      assert.ok(attempts.filter(a=>!a.srs_applied).every(a=>a.receipt.reason==='practice-only'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(workspace,`${unit.id}-complete-${width}.png`),fullPage:true});
      const beforeReload=await learningFingerprint();
      await page.getByRole('button',{name:'単元の概要に戻る',exact:true}).click();
      await page.getByRole('button',{name:'前回の結果を見る',exact:true}).waitFor();
      assert.deepEqual(await learningFingerprint(),beforeReload,'Returning to overview must not issue or save again');
      await page.reload();
      await page.getByRole('button',{name:'前回の結果を見る',exact:true}).click();
      await page.getByText('回答と自己評価を保存しました。単元練習は復習予定を変更しません。',{exact:true}).waitFor();
      assert.deepEqual(await learningFingerprint(),beforeReload,'Viewing a completed run must not issue or save again');
      console.log(`PASS ${unit.id} ${width}px: complete unit, paraphrases self-evaluated, history saved, existing schedule preserved, result restored`);
      const beforeHistory = await learningFingerprint();
      await page.getByRole('link',{name:'回答履歴を見る',exact:true}).click();
      await page.locator('[data-history-state="ready"]').waitFor();
      assert.equal(await page.locator('[data-history-record]').count(),unit.answers.length);
      const explanationCount=(await pool.query("select count(*)::int as count from private.exercise_attempts a join private.exercise_instances i using(instance_id) where i.presentation->>'unitId'=$1 and a.grading_status='ungraded'",[unit.id])).rows[0].count;
      assert.equal(await page.locator('[data-evaluation-kind="explanation"]').count(),explanationCount);
      await page.screenshot({path:path.join(workspace,`history-${unit.id}-${width}.png`),fullPage:true});
      const record=(await pool.query("select a.attempt_id,a.raw_answer,a.grading_status from private.exercise_attempts a join private.exercise_instances i using(instance_id) where i.presentation->>'unitId'=$1 order by a.submitted_at desc limit 1",[unit.id])).rows[0];
      await page.locator(`a[data-history-record="${record.attempt_id}"]`).click();
      await page.locator('[data-history-detail]').waitFor();assert.equal(await page.locator('[data-history-raw-answer]').textContent(),record.raw_answer);
      await page.getByText('追加練習として保存・復習予定は変更なし',{exact:true}).waitFor();
      if(unit.project.id==='kuzushiji') {const bounds=await page.locator('.history-detail-section .exercise-asset-image').first().boundingBox();assert.ok(bounds&&bounds.height<=210,'Archived glyph must keep a readable size');}
      if(unit.id==='kuzushiji-kana-2') {assert.equal(await page.locator('.glyph-comparison img').count(),2);await page.getByText('前の単元の同じ読み',{exact:true}).waitFor();}
      if(record.grading_status==='ungraded') {await page.getByText('説明・自己評価',{exact:true}).waitFor();await page.getByRole('heading',{name:'許容する言い換え',exact:true}).waitFor();}
      await page.screenshot({path:path.join(workspace,`history-detail-${unit.id}-${width}.png`),fullPage:true});
      await page.getByRole('link',{name:'学習履歴',exact:true}).click();await page.locator('[data-history-state="ready"]').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('unit'),unit.id);
      await page.getByLabel('要再確認の回答だけ').check();await page.getByRole('button',{name:'絞り込む',exact:true}).click();
      await page.getByRole('heading',{name:'この条件の履歴はありません',exact:true}).waitFor();
      assert.deepEqual(await learningFingerprint(),beforeHistory,'Viewing/filtering history must not issue, save or alter any learning state');
      console.log(`PASS history ${unit.id} ${width}px: list, saved original/rubric, practice receipt, preserved filters, recheck/empty, no writes`);
    } finally {setUnitFixtures(false); await context.close();}
  }
  for (const unit of units) for (const failure of ['before-send','after-acceptance']) {
    await resetLearning(); setUnitFixtures(true);
    const profile=path.join(workspace,'profiles',unit.id+'-resume-'+failure);
    let context=await launchContext(profile), captured;
    try {
      let page=context.pages()[0]; await startUnit(page,unit);
      // Save a prefix so a restart must restore actual position, not start again.
      await unitAnswer(page,unit.answers[0]); await unitAnswer(page,unit.answers[1]);
      let interrupted=false;
      await context.route('**/api/review/pilot/**',async route=>{
        if(new URL(route.request().url()).pathname==='/api/review/pilot/attempt'&&!interrupted) {
          captured=route.request().postDataJSON();
          if(failure==='after-acceptance')assert.equal((await route.fetch()).status(),200);
          interrupted=true;
        }
        await route.abort('internetdisconnected');
      });
      await unitAnswer(page,unit.answers[2],false,failure==='before-send');
      await eventually(async()=>{assert.equal(interrupted,true);assert.equal((await outbox(page)).length,3);},'Unit answer not durably retained');
      assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count,failure==='before-send'?2:3);
      await context.close();context=await launchContext(profile);page=context.pages()[0];
      await page.goto(appUrl+'/units/'+unit.id);
      await page.getByRole('button',{name:'途中から再開（3 / '+unit.answers.length+'問）',exact:true}).click();
      await eventually(async()=>{assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count,3);const entries=await outbox(page);assert.ok(entries.every(e=>/^accepted-/.test(e.record.status)));},'Unit restart did not flush original attempt');
      assert.equal(await page.locator('.review-progress-row > div > span').innerText(),'4 / '+unit.answers.length);
      if(unit.project.id==='philosophy')assert.equal(await page.locator('textarea').count(),1);
      const replay=await page.request.post(appUrl+'/api/review/pilot/attempt',{data:captured,headers:{Origin:appUrl}});
      assert.equal(replay.status(),200);
      assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count,3);
      for(let i=3;i<unit.answers.length;i++)await unitAnswer(page,unit.answers[i],await page.locator('textarea').count()>0);
      await page.getByText('回答と自己評価を保存しました。単元練習は復習予定を変更しません。',{exact:true}).waitFor();
      assert.equal((await pool.query('select count(*)::int as count from private.exercise_attempts')).rows[0].count,unit.answers.length);
      assert.equal((await schedules()).length,0);
      console.log(`PASS ${unit.id}: ${failure}, restart resumes question 4, immutable replay adds no history or SRS`);
    } finally {setUnitFixtures(false);await context.close();}
  }
  await resetLearning();setUnitFixtures(true);
  {
    const context=await launchContext(path.join(workspace,'profiles','unit-start-retry'));
    try {
      const page=context.pages()[0], unit=units[0],before=await learningFingerprint();
      await page.goto(appUrl+'/units/'+unit.id);
      let failed=false;
      await context.route('**/api/units/start',route=>{failed=true;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary_failure"}'});});
      await page.getByRole('button',{name:'単元を練習する',exact:true}).click();
      await page.locator('.unit-overview [role="alert"]').waitFor();assert.equal(failed,true);
      assert.deepEqual(await learningFingerprint(),before);
      await context.unroute('**/api/units/start');
      await page.getByRole('button',{name:'単元を練習する',exact:true}).click();
      await page.getByRole('textbox',{name:'回答',exact:true}).waitFor();
      console.log('PASS unit start failure: no writes, clear error, same button retries successfully');
    } finally {setUnitFixtures(false);await context.close();}
  }

  const draftScenarios = await verifyUnitDrafts({ units, appUrl, workspace, launchContext, resetLearning,
    setUnitFixtures, unitAnswer, startUnit, learningFingerprint, schedules, outbox, pool });

  for (const mode of ['subjects-off', 'v2-off']) {
    await resetLearning(); await stopApp();
    const flags = { ...env,
      STUDY_GRAPH_PILOT_ISSUANCE_ENABLED: mode === 'subjects-off' ? 'false' : 'true',
      STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED: mode === 'subjects-off' ? 'false' : 'true',
      STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED: mode === 'subjects-off' ? 'false' : 'true',
      STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED: mode === 'v2-off' ? 'false' : 'true' };
    await startApp(flags);
    const context = await launchContext(path.join(workspace, 'profiles', 'entry-' + mode));
    try {
      const page = context.pages()[0], before = await learningFingerprint();
      await page.goto(appUrl + '/review');
      for (const project of projects) {
        const entry = page.locator(`[data-review-project="${project.id}"]`); await entry.waitFor();
        assert.equal(await entry.getAttribute('data-review-status'), mode === 'v2-off' || project.id === 'kuzushiji' ? 'paused' : 'ready');
        assert.equal(await entry.locator('a[href^="/review/session"]').count(), 0);
      }
      assert.deepEqual(await learningFingerprint(), before);
      console.log(`PASS entry ${mode}: disabled issuance is never advertised as available`);
    } finally { await context.close(); }
  }
  assert.ok(fixtureRequests > 0, 'App did not read fixed Notion Scope');
  {
    const context=await launchContext(path.join(workspace,'profiles','history-read-failure'));
    try { const page=context.pages()[0];const before=await learningFingerprint();historyReadFailure=true;await page.goto(appUrl+'/history');await page.getByRole('heading',{name:'学習履歴を取得できません',exact:true}).waitFor();assert.equal(await page.locator('[data-history-record]').count(),0);assert.equal(await page.getByText('保存済みの回答はまだありません',{exact:true}).count(),0);historyReadFailure=false;await page.getByRole('button',{name:'もう一度読み込む',exact:true}).click();await page.locator('[data-history-state="ready"]').waitFor();assert.deepEqual(await learningFingerprint(),before);console.log('PASS history read failure/recovery: no false zero, retry is read-only'); }
    finally {historyReadFailure=false;await context.close();}
  }
  passed = true;
  console.log(`PASS ${30+units.length*6+draftScenarios} browser scenarios (30 common + ${units.length} units × 6 completion/history/recovery cases + ${draftScenarios} draft cases); no hosted credentials or production database used`);
} catch (error) {
  console.error(error);
  console.error('Isolated E2E artifacts: ' + workspace);
  process.exitCode = 1;
} finally {
  await stopApp();
  if (log) await log.close();
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (pool) await pool.end();
  if (databaseCreated) sql('drop database ' + database + ' with (force);', 'postgres');
  if (passed) console.log('Isolated app stopped; disposable database removed. Screenshots retained: ' + workspace);
}
