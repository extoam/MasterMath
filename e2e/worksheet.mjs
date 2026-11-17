// A whole day and the next: 10 pages, pause and resume, hand-in, next-day corrections.
import { checker, freshStart, launch, line, openParent, sleep, text } from './helpers.mjs';

const { browser, page } = await launch();
const { check, done } = checker();
await freshStart(page);
check('Home offers worksheet 1 from B101a', /^B101a–B105b/.test(await text(page, '[data-testid=next-info]')), await text(page, '[data-testid=next-info]'));
await page.click('[data-testid=start]');
await page.waitForSelector('main.sheet .problem canvas');
check('a worksheet is 10 pages', (await page.$$('.progress-bar .chip')).length === 10);
for (let i = 0; i < 10; i++) {
  for (const c of await page.$$('.problem canvas')) await line(page, c);
  if (i === 5) {
    await page.click('[data-testid=pause]');
    await page.waitForSelector('[data-testid=pause-cover]');
    await page.click('[data-testid=resume]');
    await sleep(100);
  }
  if (i < 9) {
    if (!(await page.$eval('[data-testid=next-sheet]', (b) => !b.disabled))) {
      check(`Next enabled on page ${i + 1}`, false);
      break;
    }
    const before = await page.$eval('main.sheet', (m) => m.dataset.code);
    await page.click('[data-testid=next-sheet]');
    await page.waitForFunction((b) => document.querySelector('main.sheet').dataset.code !== b, {}, before);
  }
}
check('last page B105b has Submit', (await page.$eval('main.sheet', (m) => m.dataset.code)) === 'B105b' && !!(await page.$('[data-testid=submit]')));
await page.waitForFunction(() => !document.querySelector('[data-testid=submit]').disabled, { timeout: 5000 }).catch(() => {});
await page.click('[data-testid=submit]');
await page.waitForSelector('[data-testid=handed-in]');
check('worksheet handed in', true);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Home').click());
await page.waitForSelector('[data-testid=home-title]');
await openParent(page);
await page.click('[data-testid=dev-tomorrow]');
await page.waitForSelector('[data-testid=corrections-due]', { timeout: 5000 }).catch(() => {});
check('next day: corrections are due', !!(await page.$('[data-testid=corrections-due]')), await text(page, '[data-testid=corrections-due]'));
await page.click('[data-testid=start-corrections]');
await page.waitForSelector('main.sheet[data-mode=correcting]');
check('corrections open with circled problems', (await page.$$('.problem[data-mark=wrong]')).length > 0);
await browser.close();
process.exit(done() ? 0 : 1);
