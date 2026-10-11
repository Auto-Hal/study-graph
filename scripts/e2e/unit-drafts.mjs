import assert from 'node:assert/strict';
import path from 'node:path';

const prefix = 'study-graph-unit-draft-v1:';
async function drafts(page) {
  return page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix))
    .map(key => ({ key, value: JSON.parse(localStorage.getItem(key)) })), prefix);
}

export async function verifyUnitDrafts({ units, appUrl, workspace, launchContext, resetLearning,
  setUnitFixtures, unitAnswer, startUnit, learningFingerprint, schedules, outbox, pool }) {
  const subjects = units.slice(0, 3);
  async function resume(page, unit, answered) {
    await page.getByRole('button', { name: `途中から再開（${answered} / ${unit.answers.length}問）`, exact: true }).click();
    await page.locator('.review-stage').waitFor();
  }
  async function reloadResume(page, unit, answered) {
    await page.reload(); await resume(page, unit, answered);
  }
  async function grade(page) {
    await page.getByRole('button', { name: /^できた/ }).click();
    await page.locator('.answer-panel').waitFor({ state: 'hidden' });
  }
  for (const width of [390, 820]) for (const unit of subjects) {
    await resetLearning(); setUnitFixtures(true);
    const profile = path.join(workspace, 'profiles', `${unit.id}-draft-${width}`);
    let context = await launchContext(profile, width);
    try {
      let page = context.pages()[0]; await startUnit(page, unit);
      const before = await learningFingerprint(), raw = '　' + unit.answers[0] + '　';
      await page.getByRole('textbox', { name: '回答', exact: true }).fill(raw);
      // Reload immediately after the input event, with no debounce delay.
      await reloadResume(page, unit, 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), raw);
      await page.locator('[data-unit-draft-state="restored"]').waitFor();
      assert.deepEqual(await learningFingerprint(), before);
      await page.getByRole('textbox', { name: '回答', exact: true }).fill('');
      await reloadResume(page, unit, 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), '');
      await page.getByRole('textbox', { name: '回答', exact: true }).fill(raw);
      await page.getByRole('button', { name: '下書きを残して終了', exact: true }).click();
      await resume(page, unit, 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), raw);
      await page.getByRole('button', { name: '回答する', exact: true }).click();
      await page.locator('.answer-verdict.correct').waitFor();
      const staleDraft = (await drafts(page))[0];
      assert.equal(staleDraft.value.revealed, true);
      assert.deepEqual(await learningFingerprint(), before, 'Revealing/restoring must not save an attempt');
      assert.equal((await outbox(page)).length, 0);
      await context.close(); context = await launchContext(profile, width); page = context.pages()[0];
      await page.goto(appUrl + '/units/' + unit.id); await resume(page, unit, 0);
      await page.locator('.answer-panel').waitFor();
      assert.equal(await page.locator('.your-answer').textContent(), 'あなたの回答：' + raw);
      assert.deepEqual(await learningFingerprint(), before);
      await page.screenshot({ path: path.join(workspace, `draft-restored-${unit.id}-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await grade(page);
      assert.equal((await drafts(page)).length, 0, 'Clear the draft only after the outbox commit');
      // Even a stale draft left by failed cleanup cannot override the committed prefix.
      await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), staleDraft);
      await page.getByRole('textbox', { name: '回答', exact: true }).fill(unit.answers[1]);
      await reloadResume(page, unit, 1);
      assert.equal(await page.locator('.review-progress-row > div > span').innerText(), '2 / ' + unit.answers.length);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), unit.answers[1]);
      assert.equal((await pool.query('select raw_answer from private.exercise_attempts')).rows[0].raw_answer, raw);
      assert.equal((await outbox(page)).length, 1); assert.equal((await schedules()).length, 0);
      // Both art and philosophy restore a freely worded multiline explanation.
      if (unit.project.id !== 'kuzushiji') {
        const explanationIndex = unit.project.id === 'philosophy' ? 3 : unit.answers.length - 1;
        for (let i = 1; i < explanationIndex; i++) await unitAnswer(page, unit.answers[i]);
        const explanation = '  ' + unit.answers[explanationIndex] + '\n自分の言葉で説明を続ける。　';
        const explainedBefore = await learningFingerprint();
        await page.locator('textarea').fill(explanation); await reloadResume(page, unit, explanationIndex);
        assert.equal(await page.locator('textarea').inputValue(), explanation);
        await page.getByRole('button', { name: '回答する', exact: true }).click();
        await page.getByText('要点を確認して自己評価', { exact: true }).waitFor();
        await context.close(); context = await launchContext(profile, width); page = context.pages()[0];
        await page.goto(appUrl + '/units/' + unit.id); await resume(page, unit, explanationIndex);
        await page.locator('.answer-panel').waitFor();
        assert.equal(await page.locator('.your-answer').textContent(), 'あなたの回答：' + explanation);
        assert.equal(await page.locator('.answer-verdict.incorrect').count(), 0);
        for (const title of ['必要な要点', '許容する言い換え', '重大な誤解']) await page.getByRole('heading', { name: title, exact: true }).waitFor();
        assert.deepEqual(await learningFingerprint(), explainedBefore);
        await page.screenshot({ path: path.join(workspace, `draft-explanation-${unit.id}-${width}.png`), fullPage: true });
        await grade(page);
        const saved = (await pool.query('select raw_answer,grading_status,is_correct,self_evaluation from private.exercise_attempts where raw_answer=$1', [explanation])).rows;
        assert.equal(saved.length, 1); assert.equal(saved[0].grading_status, 'ungraded');
        assert.equal(saved[0].is_correct, null); assert.equal(saved[0].self_evaluation, 'good');
        assert.equal((await schedules()).length, 0);
      }
      console.log(`PASS draft ${unit.id} ${width}px: last edit, clearing, exit/reload, revealed restart, committed prefix, original text, no draft API/SRS writes`);
    } finally { setUnitFixtures(false); await context.close(); }
  }
  for (const unit of subjects) {
    await resetLearning(); setUnitFixtures(true);
    const context = await launchContext(path.join(workspace, 'profiles', unit.id + '-draft-storage-failure'));
    try {
      const page = context.pages()[0]; await startUnit(page, unit);
      const before = await learningFingerprint();
      await page.getByRole('textbox', { name: '回答', exact: true }).fill(unit.answers[0]);
      await page.evaluate(prefix => {
        window.__draftSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith(prefix)) throw new DOMException('Test storage full', 'QuotaExceededError');
          return window.__draftSetItem.call(this, key, value);
        };
      }, prefix);
      const latest = unit.answers[0] + ' 最新の入力';
      await page.getByRole('textbox', { name: '回答', exact: true }).fill(latest);
      await page.locator('[data-unit-draft-state="error"] [role="alert"]').waitFor();
      assert.equal(await page.locator('[data-unit-draft-state="saved"]').count(), 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), latest);
      assert.equal((await drafts(page))[0].value.rawAnswer, unit.answers[0]);
      assert.deepEqual(await learningFingerprint(), before);
      await page.screenshot({ path: path.join(workspace, `draft-storage-failure-${unit.id}.png`), fullPage: true });
      await page.evaluate(() => { Storage.prototype.setItem = window.__draftSetItem; delete window.__draftSetItem; });
      await page.getByRole('button', { name: '下書きを保存し直す', exact: true }).click();
      await page.locator('[data-unit-draft-state="saved"]').waitFor();
      await reloadResume(page, unit, 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), latest);
      const retained = (await drafts(page))[0];
      await page.evaluate(({ key }) => localStorage.setItem(key, 'invalid-draft-json'), retained);
      await page.reload(); await page.getByRole('button', { name: `途中から再開（0 / ${unit.answers.length}問）`, exact: true }).click();
      await page.locator('.unit-overview [role="alert"]').waitFor();
      assert.equal(await page.locator('.review-stage').count(), 0, 'Unreadable draft must not become a blank editable input');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), retained.key), 'invalid-draft-json');
      await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), retained);
      await resume(page, unit, 0);
      assert.equal(await page.getByRole('textbox', { name: '回答', exact: true }).inputValue(), latest);
      assert.deepEqual(await learningFingerprint(), before); assert.equal((await outbox(page)).length, 0);
      console.log(`PASS draft storage ${unit.id}: truthful quota error, in-memory text, retry, corrupt read retained, recovery without API writes`);
    } finally { setUnitFixtures(false); await context.close(); }
  }
  return subjects.length * 3;
}
