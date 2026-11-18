// Save a backup, wipe the tablet, restore it: her name, handwriting and the parent's decisions come back.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker, freshStart, launch, openParent, sleep, text } from './helpers.mjs';

const { browser, page } = await launch();
const { check, done } = checker();
const downloads = mkdtempSync(join(tmpdir(), 'mastermath-backup-'));
// The share sheet cannot be driven here; use the plain download path.
await page.evaluateOnNewDocument(() => { navigator.canShare = undefined; });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

await freshStart(page, 'tonya');
await openParent(page);
await page.select('[data-testid=decide-select]', '141');
await page.click('[data-testid=decide-go]');
await page.click('[data-testid=decide-confirm]');
await page.waitForSelector('[data-testid=parent-decided]');
check('no backup yet', /No backup saved yet/.test(await text(page, '[data-testid=backup-last]')));
await page.click('[data-testid=backup-save]');
await page.waitForSelector('[data-testid=backup-message]');
let file;
for (let i = 0; i < 50 && !file; i++) {
  file = readdirSync(downloads).find((f) => /^mastermath-backup-.*\.json$/.test(f));
  if (!file) await sleep(100);
}
check('backup file saved', !!file, file);
check('last backup shown', /Last backup:/.test(await text(page, '[data-testid=backup-last]')));

// Wipe everything, as if the browser data were cleared.
await page.click('[data-testid=reset]');
await page.click('[data-testid=reset-confirm]');
await page.waitForSelector('[data-testid=name-input]');
check('tablet wiped: asks the name again', true);
await page.type('[data-testid=name-input]', 'someone');
await page.click('[data-testid=name-save]');
await page.waitForSelector('[data-testid=home-title]');
await openParent(page);
const input = await page.$('[data-testid=backup-file]');
await input.uploadFile(join(downloads, file));
await page.waitForSelector('[data-testid=backup-confirm]');
check('shows what the backup holds', /for tonya/.test(await text(page, '[data-testid=backup-confirm]')), await text(page, '[data-testid=backup-confirm]'));
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-testid=backup-restore-confirm]')]);
await page.waitForSelector('[data-testid=next-info]');
check('her name is back', /tonya/i.test(await text(page, 'main')), (await text(page, 'main'))?.slice(0, 80));
check('the decision is back: B141', /^B141a/.test(await text(page, '[data-testid=next-info]')), await text(page, '[data-testid=next-info]'));
await page.click('[data-testid=start]');
await page.waitForSelector('main.sheet .problem canvas');
check('worksheets can start (handwriting samples restored)', true);
await browser.close();
process.exit(done() ? 0 : 1);
