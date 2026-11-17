// Shared helpers for the browser checks in e2e/. They drive a real Chrome against the dev server.
// Run: npm run dev (in another terminal), then npm run e2e.
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BASE = process.env.E2E_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fresh browser with an empty profile in the system temp folder. */
export async function launch(width = 800, height = 1280) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'mastermath-e2e-')), args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  return { browser, page };
}

export function checker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  };
  const done = () => {
    const passed = results.filter(Boolean).length;
    console.log(`${passed}/${results.length} checks passed`);
    return passed === results.length;
  };
  return { check, done };
}

export const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim().replace(/\s+/g, ' ')).catch(() => null);

/** First opening: type a name, then give the app 3 samples per digit so worksheets can start. */
export async function freshStart(page, name = 'tonya') {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=name-input]');
  await page.type('[data-testid=name-input]', name);
  await page.click('[data-testid=name-save]');
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('mastermath'); q.onsuccess = () => r(q.result); });
    const tx = db.transaction('templates', 'readwrite');
    for (let d = 0; d < 10; d++) for (let k = 0; k < 3; k++) tx.objectStore('templates').put({ id: `t${d}${k}`, digit: d, strokes: [[{ x: 10 + d * 3, y: 10, t: 0, pressure: 0.5 }, { x: 40 - d, y: 80 + k, t: 1, pressure: 0.5 }]], createdAt: d * 10 + k, source: 'calibration' });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=start]');
}

/** A vertical pen line in an answer box. */
export async function line(page, canvas) {
  await canvas.evaluate((x) => x.scrollIntoView({ block: 'center' }));
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 12);
  await page.mouse.down();
  for (let y = 14; y < b.height - 10; y += 4) await page.mouse.move(b.x + b.width / 2, b.y + y);
  await page.mouse.up();
  await sleep(10);
}

/** Press and hold the Home title to open the Parent view. */
export async function openParent(page) {
  const t = await (await page.$('[data-testid=home-title]')).boundingBox();
  await page.mouse.move(t.x + 20, t.y + 10);
  await page.mouse.down();
  await sleep(1200);
  await page.mouse.up();
  await page.waitForSelector('[data-testid=parent-view]');
}
