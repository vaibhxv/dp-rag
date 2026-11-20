// Records an end-to-end demo of Sahayak:
//   collapsible sidebar -> ingest (OCR) -> document panel (text + original scan)
//   -> ask this document -> library -> chat with citation seals + evidence
//   -> follow-up -> out-of-scope question -> conversation history.
//
// Prereqs: Weaviate, Ollama, api (:4000) and ui (:3000, `pnpm build && pnpm start`)
// running; the files passed here NOT yet ingested (duplicates are rejected);
// the other documents already ingested. Uses the installed Chrome (playwright-core).
//
//   node demo/record-demo.mjs "docs/Sl. No. 07.pdf" "docs/Sl. No. 08.pdf"
//
// Output: demo/out/raw.webm + demo/out/marks.json, then run demo/make-video.sh.
// Narration: run `node demo/make-narration.mjs` first (Hinglish voice-over).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { LINES } from './narration.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const UI = process.env.UI_URL ?? 'http://localhost:3000';
const files = process.argv.slice(2).map((f) => resolve(f));
if (!files.length) throw new Error('Pass the files to ingest as arguments');

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.webm') || f === 'marks.json') rmSync(join(outDir, f));

// Narration clip lengths (from make-narration.mjs) pace the recording, so
// every spoken line finishes before the next caption appears.
const durationsFile = join(outDir, 'narration', 'durations.json');
if (!existsSync(durationsFile)) throw new Error('Run `node demo/make-narration.mjs` first');
const DURATIONS = JSON.parse(readFileSync(durationsFile, 'utf8'));

const SIZE = { width: 1440, height: 900 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: outDir, size: SIZE },
  permissions: ['clipboard-read', 'clipboard-write'],
});

// Demo-only overlay: caption bar + visible cursor (videos don't show the real one).
await context.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
      #__cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;
        background:rgba(15,23,42,.9);color:#fff;font:500 16px/1.45 Inter,system-ui,sans-serif;
        padding:11px 20px;border-radius:12px;max-width:min(980px,90vw);text-align:center;
        box-shadow:0 8px 28px rgba(15,23,42,.25);transition:opacity .25s;pointer-events:none}
      #__cap:empty{opacity:0}
      #__cur{position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;
        border-radius:50%;background:rgba(36,87,214,.45);border:2px solid #fff;
        box-shadow:0 0 0 1px rgba(15,23,42,.35);pointer-events:none;transition:transform .1s}
      #__cur.down{transform:scale(.7)}`;
    document.head.appendChild(style);
    const cap = Object.assign(document.createElement('div'), { id: '__cap' });
    const cur = Object.assign(document.createElement('div'), { id: '__cur' });
    document.documentElement.append(cap, cur);
    cur.style.left = '720px';
    cur.style.top = '450px';
    window.addEventListener('mousemove', (e) => {
      cur.style.left = `${e.clientX}px`;
      cur.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener('mousedown', () => cur.classList.add('down'), true);
    window.addEventListener('mouseup', () => cur.classList.remove('down'), true);
    window.__caption = (t) => { cap.textContent = t; };
  });
});

const page = await context.newPage();
const t0 = Date.now();
const marks = [];
const mark = (name) => {
  marks.push({ name, t: (Date.now() - t0) / 1000 });
  console.log(`[${marks.at(-1).t.toFixed(1)}s] ${name}`);
};
const pause = (ms) => page.waitForTimeout(ms);
const caption = (t) => page.evaluate((x) => window.__caption?.(x), t);

let speaking = null; // { t, dur, sped } of the current narration line
/** Waits until the current narration line has finished (sped-up lines excepted). */
async function narrationDone() {
  if (!speaking || speaking.sped) return;
  const left = speaking.t + speaking.dur + 0.35 - (Date.now() - t0) / 1000;
  if (left > 0) await pause(left * 1000);
}
/** Shows a line's caption and starts its narration (marked for the audio mix). */
async function narrate(id) {
  await narrationDone();
  await caption(LINES[id].caption);
  mark(`say:${id}`);
  speaking = { t: marks.at(-1).t, dur: DURATIONS[id], sped: Boolean(LINES[id].sped) };
}

async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await pause(180);
}
async function click(locator) {
  await moveTo(locator);
  await locator.click();
}
async function type(locator, text) {
  await click(locator);
  await locator.pressSequentially(text, { delay: 32 });
  await pause(350);
}
/** Smooth mouse-wheel scroll over whatever is under the cursor. */
async function wheel(dy) {
  await page.mouse.move(900, 600, { steps: 10 });
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, dy / 12);
    await pause(40);
  }
}
const answers = () => page.getByRole('button', { name: 'Copy answer' });
async function ask(text) {
  const before = await answers().count();
  await type(page.locator('#composer'), text);
  await page.keyboard.press('Enter');
  await answers().nth(before).waitFor({ timeout: 180_000 });
  await pause(600);
}

// 1. Intro
await page.goto(UI);
await page.getByText('Start with a question').waitFor({ timeout: 30_000 });
await narrate('intro');
mark('intro');
await pause(5000);

// 2. Collapsible sidebar
await narrate('sidebar');
const trigger = page.locator('[data-sidebar=trigger]');
await click(trigger);
await pause(1800);
await click(trigger);
await pause(1400);

// 3. Ingest
await click(page.getByRole('button', { name: 'Ingest', exact: true }).first());
await page.getByText('Drop files here, or browse').waitFor();
await narrate('ingestIntro');
await moveTo(page.getByText('Drop files here, or browse'));
await page.locator('input[type=file]').setInputFiles(files);
await pause(2200);
await narrationDone();
await click(page.getByRole('button', { name: /^Add \d+ files?$/ }));
mark('ingest-start');
await narrate('ingestSped');
await page.getByRole('button', { name: 'Ready · open' }).nth(files.length - 1).waitFor({ timeout: 15 * 60_000 });
mark('ingest-end');
await narrate('ingestReady');
await pause(3500);

// 4. Document panel: summary, extracted text, original scan
await click(page.getByRole('button', { name: 'Ready · open' }).first());
await page.getByRole('tab', { name: 'Text' }).waitFor();
await narrate('docSummary');
await pause(4500);
await click(page.getByRole('tab', { name: /Original/ }));
await narrate('docScan');
await pause(4500);

// 5. Ask this document
await click(page.getByRole('button', { name: 'Ask this document' }));
await narrate('askDoc');
await pause(1500);
await ask('Who will exercise the powers under sections 7 and 8 of UAPA in Delhi?');
await narrate('askDocAnswer');
await pause(5500);

// 6. Library
await click(page.getByRole('button', { name: 'Library', exact: true }).first());
await page.getByText(/documents, \d+ pages/).waitFor();
await narrate('library');
await pause(3500);
await wheel(420);
await pause(2000);
await wheel(-420);
await click(page.getByRole('button', { name: /^Guidelines & SOPs/ }).first());
await narrate('collections');
await pause(2800);
await click(page.getByRole('button', { name: /^All ·/ }));
await pause(600);
await type(page.getByPlaceholder('Search titles, files, summaries'), 'BNSS');
await pause(2500);

// 7. New chat with citations
await click(page.getByRole('button', { name: 'New chat' }).first());
await narrate('newChat');
await pause(3500);
await ask('What is the charge for deploying a Head Constable?');
await narrate('keyFigures');
await pause(4000);
const cite = page.getByRole('button', { name: /^Source 1:/ }).last();
await narrate('hover');
await moveTo(cite);
await pause(3500);
await narrate('clickPage');
await cite.click();
await page.locator('mark').first().waitFor({ timeout: 10_000 });
await pause(5000);
await click(page.getByRole('tab', { name: /Original/ }));
await narrate('original');
await pause(4500);
await click(page.getByRole('button', { name: 'Close panel' }));

// 8. Follow-up
await narrate('followUp');
await ask('And for a Constable?');
await pause(3500);
await click(page.getByRole('button', { name: 'Useful', exact: true }).last());
await pause(1500);

// 9. Another document + out of scope
await narrate('anotherDoc');
await ask('When will the Bharatiya Nyaya Sanhita come into force?');
await pause(4500);
await narrate('notCovered');
await ask('What is the punishment for theft under IPC?');
await pause(5000);

// 10. History
await narrate('history');
await click(page.locator('[data-sidebar=menu-button]', { hasText: 'Who will exercise' }));
await pause(4000);
await narrate('outro');
await pause(3500);

await narrationDone();
await pause(800);
mark('end');
await context.close();
await browser.close();

const video = readdirSync(outDir).find((f) => f.endsWith('.webm'));
renameSync(join(outDir, video), join(outDir, 'raw.webm'));
writeFileSync(join(outDir, 'marks.json'), JSON.stringify(marks, null, 2));
console.log('Saved', join(outDir, 'raw.webm'));
