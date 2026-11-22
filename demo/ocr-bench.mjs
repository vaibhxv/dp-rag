// OCR benchmark: tesseract.js (current) vs a vision model served by Ollama.
//
//   cd api && node ../demo/ocr-bench.mjs ../docs [outDir]
//
// English: pages that have a correct text layer are rendered to an image,
// OCR'd, and compared with the text layer (character error rate, CER).
// Hindi: scanned gazette pages have no ground truth, so we report broken
// Devanagari sequences and whether key phrases (checked by eye) were read.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Packages come from the API (run this from api/): ESM resolves imports
// relative to this file, so resolve them from the working directory instead.
const fromApi = createRequire(join(process.cwd(), 'package.json'));
const load = (name) => import(pathToFileURL(fromApi.resolve(name)).href);
const { PDFParse } = await load('pdf-parse');
const { createWorker } = (await load('tesseract.js')).default ?? (await load('tesseract.js'));

const DOCS = process.argv[2] ?? '../docs';
const OUT = process.argv[3] ?? '/tmp/ocr-bench';
const OLLAMA = process.env.OLLAMA_API_ENDPOINT ?? 'http://localhost:11434';
const MODEL = process.env.OCR_MODEL ?? 'qwen3-vl:8b-instruct';
mkdirSync(OUT, { recursive: true });

const ENGLISH = [
  ['Zero FIR & e-FIR by BPR&D.pdf', 3],
  ['Zero FIR & e-FIR by BPR&D.pdf', 4],
  ['Notification dt 19.06.25 Amended IIF Form V.pdf', 1],
  ['Notification dt 19.06.25 Amended IIF Form V.pdf', 8],
  ['ATCFS_9df66131-8074-46db-acc81782815730622_ad.sands.pdf', 1],
  ['GOI Sr. No. 05.pdf', 3],
];
const HINDI = [
  ['GOI Sr. No 01.pdf', 1, ['भारत का राजपत्र', 'असाधारण', 'अधिसूचना', 'भारतीय न्याय संहिता']],
  ['GOI Sr. No 02.pdf', 1, ['भारत का राजपत्र', 'अधिसूचना', 'भारतीय न्याय संहिता', 'केन्द्रीय सरकार']],
  ['GOI Sr. No. 03.pdf', 1, ['भारत का राजपत्र', 'अधिसूचना', 'भारतीय साक्ष्य अधिनियम']],
  ['GOI Sr. No. 05.pdf', 1, ['भारत का राजपत्र', 'असाधारण', 'अधिसूचना', 'इलेक्ट्रॉनिकी']],
  ['GOI Sr. No. 05.pdf', 2, ['भारत का राजपत्र', 'सुरक्षा', 'लोक व्यवस्था', 'विदेशों']],
  ['Sl. No. 06.pdf', 1, ['दिल्ली', 'अधिसूचना', 'पुलिस']],
];

const PROMPT = [
  'Transcribe all printed text on this document page exactly as written, in reading order.',
  'Keep Hindi in Devanagari and English in English. Do not translate, summarise or correct anything.',
  'Keep line breaks and numbering. Write tables row by row with " | " between cells.',
  'Ignore handwritten notes, signatures and rubber stamps.',
  'Output only the transcribed text. If the page is blank, output nothing.',
].join('\n');

const norm = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
function cer(ref, hyp) {
  const a = [...norm(ref)], b = [...norm(hyp)];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / Math.max(1, a.length);
}
const broken = (t) => (t.match(/[ा-ौ][ा-ौ]/g) ?? []).length;
const has = (t, phrase) => norm(t).replace(/[‌‍]/g, '').includes(norm(phrase));

async function render(file, page, scale) {
  const parser = new PDFParse({ data: new Uint8Array(readFileSync(join(DOCS, file))) });
  try {
    const shot = await parser.getScreenshot({ partial: [page], scale, imageDataUrl: false, imageBuffer: true });
    const text = (await parser.getText({ partial: [page] })).pages[0]?.text ?? '';
    return { image: shot.pages[0].data, text };
  } finally {
    await parser.destroy();
  }
}

const worker = await createWorker(['eng', 'hin'], undefined, { cachePath: join(OUT, 'tess') });
async function tesseract(file, page) {
  const { image } = await render(file, page, 3);
  const t = Date.now();
  const { data } = await worker.recognize(Buffer.from(image));
  return { text: data.text, ms: Date.now() - t };
}
async function vision(file, page) {
  const { image } = await render(file, page, 2);
  const t = Date.now();
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model: MODEL, stream: false, think: false, keep_alive: '10m',
      messages: [{ role: 'user', content: PROMPT, images: [Buffer.from(image).toString('base64')] }],
      options: { temperature: 0, num_ctx: 8192, num_predict: 4096, repeat_penalty: 1.05 },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return { text: body.message?.content ?? '', ms: Date.now() - t, done: body.done_reason };
}

const slug = (f, p) => `${f.replace(/[^A-Za-z0-9]+/g, '_')}_p${p}`;
await vision(...ENGLISH[0]).catch(() => {}); // warm-up: load the model once

console.log('\n== English (CER vs text layer, lower is better)');
const sums = { t: 0, v: 0, tms: 0, vms: 0 };
for (const [file, page] of ENGLISH) {
  const { text: ref } = await render(file, page, 1);
  const t = await tesseract(file, page);
  const v = await vision(file, page);
  const ct = cer(ref, t.text), cv = cer(ref, v.text);
  sums.t += ct; sums.v += cv; sums.tms += t.ms; sums.vms += v.ms;
  writeFileSync(join(OUT, `${slug(file, page)}.tesseract.txt`), t.text);
  writeFileSync(join(OUT, `${slug(file, page)}.vision.txt`), v.text);
  console.log(`${file} p${page}: tesseract ${(ct * 100).toFixed(1)}% (${t.ms} ms) | ${MODEL} ${(cv * 100).toFixed(1)}% (${v.ms} ms${v.done !== 'stop' ? ', ' + v.done : ''})`);
}
const n = ENGLISH.length;
console.log(`MEAN: tesseract CER ${(sums.t / n * 100).toFixed(1)}% ${Math.round(sums.tms / n)} ms/page | ${MODEL} CER ${(sums.v / n * 100).toFixed(1)}% ${Math.round(sums.vms / n)} ms/page`);

console.log('\n== Hindi scans (key phrases found, broken Devanagari pairs)');
const hs = { t: 0, v: 0, total: 0 };
for (const [file, page, phrases] of HINDI) {
  const t = await tesseract(file, page);
  const v = await vision(file, page);
  const ft = phrases.filter((p) => has(t.text, p)).length, fv = phrases.filter((p) => has(v.text, p)).length;
  hs.t += ft; hs.v += fv; hs.total += phrases.length;
  writeFileSync(join(OUT, `${slug(file, page)}.tesseract.txt`), t.text);
  writeFileSync(join(OUT, `${slug(file, page)}.vision.txt`), v.text);
  console.log(`${file} p${page}: tesseract ${ft}/${phrases.length} phrases, ${broken(t.text)} broken (${t.ms} ms) | ${MODEL} ${fv}/${phrases.length}, ${broken(v.text)} broken (${v.ms} ms)`);
}
console.log(`TOTAL key phrases: tesseract ${hs.t}/${hs.total} | ${MODEL} ${hs.v}/${hs.total}`);
await worker.terminate();
