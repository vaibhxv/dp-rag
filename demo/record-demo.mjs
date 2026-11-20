// Records an end-to-end demo of the knowledge assistant:
//   collapsible sidebar -> ingest (OCR) -> document panel (text + original PDF)
//   -> ask this document -> library -> chat with citations -> follow-up
//   -> out-of-scope question -> conversation history.
//
// Prereqs: Weaviate, Ollama, api (:4000) and ui (:3000, `pnpm build && pnpm start`)
// running; the files passed here NOT yet ingested (duplicates are rejected);
// the other documents already ingested. Uses the installed Chrome (playwright-core).
//
//   node demo/record-demo.mjs "docs/Sl. No. 07.pdf" "docs/Sl. No. 08.pdf"
//
// Output: demo/out/raw.webm + demo/out/marks.json, then run demo/make-video.sh.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const UI = process.env.UI_URL ?? 'http://localhost:3000';
const files = process.argv.slice(2).map((f) => resolve(f));
if (!files.length) throw new Error('Pass the files to ingest as arguments');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

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
await page.getByText(/documents · \d+ pages indexed/).waitFor({ timeout: 30_000 });
await page.getByText('Try one of these').waitFor({ timeout: 10_000 });
await caption('A chat-first knowledge assistant: local LLM + self-hosted Weaviate + scanned-PDF OCR. Nothing leaves the machine.');
mark('intro');
await pause(4500);

// 2. Collapsible sidebar
await caption('Collapsible sidebar: new chat, ingest, library and recent conversations');
const trigger = page.locator('[data-sidebar=trigger]');
await click(trigger);
await pause(1600);
await click(trigger);
await pause(1400);

// 3. Ingest
await click(page.getByRole('button', { name: 'Ingest documents' }).first());
await page.getByText('Drop files here or click to browse').waitFor();
await caption('Ingest: two scanned Delhi Gazette notifications (image-only PDFs, no text layer)');
await moveTo(page.getByText('Drop files here or click to browse'));
await page.locator('input[type=file]').setInputFiles(files);
await pause(2200);
await click(page.getByRole('button', { name: /^Ingest \d+ files?$/ }));
mark('ingest-start');
await caption('⏩ Sped up: runs in the background · OCR (English + Hindi) → LLM title & summary → chunks embedded into Weaviate');
await page.getByRole('button', { name: 'Ready' }).nth(files.length - 1).waitFor({ timeout: 15 * 60_000 });
mark('ingest-end');
await caption('Both documents are ready: the original PDFs are kept in the local SQLite file store');
await pause(3000);

// 4. Document panel: summary, extracted text, original PDF
await click(page.getByRole('button', { name: 'Ready' }).first());
await page.getByRole('tab', { name: 'Extracted text' }).waitFor();
await caption('Every document gets an LLM-written title, summary and category, plus its OCR text page by page');
await pause(4500);
await click(page.getByRole('tab', { name: /Original/ }));
await caption('The original scanned PDF, rendered in the app from the local file store');
await pause(4500);

// 5. Ask this document
await click(page.getByRole('button', { name: 'Ask this document' }));
await caption('“Ask this document” limits retrieval to one file');
await pause(1500);
await ask('Who will exercise the powers under sections 7 and 8 of UAPA in Delhi?');
await caption('The answer streams from the local LLM, with a citation to the exact page');
await pause(5000);
await click(page.getByRole('button', { name: 'Search all documents' }));
await pause(800);

// 6. Library
await click(page.getByRole('button', { name: /^Library/ }).first());
await caption('Library: every ingested document, grouped by category, searchable and filterable');
await pause(3000);
await type(page.getByPlaceholder('Search titles, file names or summaries'), 'BNSS');
await pause(2500);
await page.getByPlaceholder('Search titles, file names or summaries').fill('');
await click(page.getByRole('button', { name: /^Scanned \(OCR\)/ }));
await pause(2500);
await click(page.getByRole('button', { name: /^All \d+/ }));
await pause(1000);

// 7. New chat with citations
await click(page.getByRole('button', { name: 'New chat' }).first());
await caption('Chat across all 25 documents. Suggested questions were generated from the documents at ingestion.');
await pause(3500);
await ask('What is the charge for deploying a Head Constable?');
await caption('Hover a citation to preview the passage…');
const cite = page.getByRole('button', { name: /^Source 1:/ }).last();
await moveTo(cite);
await pause(3500);
await caption('…click it to open the page with the passage highlighted');
await cite.click();
await page.locator('mark').first().waitFor({ timeout: 10_000 });
await pause(4500);
await click(page.getByRole('tab', { name: /Original/ }));
await caption('Jump straight to the cited page in the original scan');
await pause(4500);
await click(page.getByRole('button', { name: 'Close panel' }));

// 8. Follow-up
await caption('Follow-up questions use the conversation for context');
await ask('And for a Constable?');
await pause(3500);
await click(page.getByRole('button', { name: 'Useful', exact: true }).last());
await pause(1500);

// 9. Another document + out of scope
await caption('Answers come from whichever document holds the fact');
await ask('When did the Bharatiya Nagarik Suraksha Sanhita come into force?');
await pause(4500);
await caption('Asked about something the documents do not contain, it says so instead of guessing');
await ask('What is the punishment for theft under IPC?');
await pause(5000);

// 10. History
await caption('Conversations are kept in the sidebar; pick one up where you left off');
await click(page.locator('[data-sidebar=menu-button]', { hasText: 'Who will exercise' }));
await pause(4000);
await caption('Ingestion ✓  Library ✓  Cited answers ✓  — running entirely on this laptop');
await pause(3500);

mark('end');
await context.close();
await browser.close();

const video = readdirSync(outDir).find((f) => f.endsWith('.webm'));
renameSync(join(outDir, video), join(outDir, 'raw.webm'));
writeFileSync(join(outDir, 'marks.json'), JSON.stringify(marks, null, 2));
console.log('Saved', join(outDir, 'raw.webm'));
