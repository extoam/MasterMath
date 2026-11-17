// Pages marked before the digit-by-digit check are re-checked once: right answers stop counting as mistakes.
import { checker, freshStart, launch, line, openParent, text } from './helpers.mjs';

const { browser, page } = await launch();
const { check, done } = checker();
await freshStart(page);
await page.click('[data-testid=start]');
await page.waitForSelector('main.sheet .problem canvas');
for (let i = 0; i < 10; i++) {
  for (const c of await page.$$('.problem canvas')) await line(page, c);
  if (i < 9) {
    const before = await page.$eval('main.sheet', (m) => m.dataset.code);
    await page.click('[data-testid=next-sheet]');
    await page.waitForFunction((b) => document.querySelector('main.sheet').dataset.code !== b, {}, before);
  }
}
await page.waitForFunction(() => !document.querySelector('[data-testid=submit]').disabled, { timeout: 5000 }).catch(() => {});
await page.click('[data-testid=submit]');
await page.waitForSelector('[data-testid=handed-in]');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Home').click());
await page.waitForSelector('[data-testid=home-title]');

// Pretend this worksheet was marked by the old reader: replace the ink of the first page's
// problems with the right digits' own samples, and forget that it was already re-checked.
const first = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mastermath'); q.onsuccess = () => r(q.result); });
  const get = (store) => new Promise((r) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); });
  const templates = await get('templates');
  const sides = await get('sides');
  const side = sides.find((s) => s.code === 'B101a');
  const ink = (await get('side_ink')).find((x) => x.id === side.id);
  for (const item of ink.rounds[0].items) {
    const digits = String(side.problems[item.position].answer).split('').map(Number);
    item.boxes = digits.map((d, i) => ({ digitIndex: i, read: null, confident: false, trueLabel: null, strokes: templates.find((t) => t.digit === d).strokes }));
  }
  const tx = db.transaction(['side_ink', 'remarks'], 'readwrite');
  tx.objectStore('side_ink').put(ink);
  tx.objectStore('remarks').clear();
  await new Promise((r) => (tx.oncomplete = r));
  db.close();
  return { total: side.total, wrong: side.total - side.firstPassCorrect };
});
check('the page started with mistakes', first.wrong > 0, `${first.wrong} of ${first.total} wrong`);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-testid=home-title]');
const remark = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mastermath'); q.onsuccess = () => r(q.result); });
  const rows = await new Promise((r) => { const q = db.transaction('remarks').objectStore('remarks').getAll(); q.onsuccess = () => r(q.result); });
  db.close();
  return rows.map((r) => r.positions.length);
});
check('re-checked every page once', remark.length === 10, JSON.stringify(remark));
check('the rewritten page now reads right', remark.includes(first.wrong), JSON.stringify(remark));
check('the lines on the other pages stay wrong', remark.filter((n) => n === 0).length === 9);
await openParent(page);
const row = await page.$$eval('[data-testid=parent-view] table tbody tr', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
check('right first time counts the re-checked page', row.some((r) => r.includes('19%')), row.join(' | '));
await page.click('[data-testid=dev-tomorrow]');
await page.waitForSelector('[data-testid=corrections-due]', { timeout: 5000 }).catch(() => {});
const due = await text(page, '[data-testid=corrections-due]');
check('corrections no longer include the right page', /^\d+/.test(due ?? '') && Number(due.match(/\d+/)[0]) === 178 - first.wrong, due);
await browser.close();
process.exit(done() ? 0 : 1);
