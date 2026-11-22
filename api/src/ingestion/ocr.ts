import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';

/**
 * Page OCR with two engines:
 *
 * - `ollama` (OCR_ENGINE=ollama): a vision-language model served by Ollama
 *   (default `qwen3-vl:8b-instruct`) reads the rendered page on the GPU. Much better on
 *   Devanagari, gazette mastheads and pages with stamps. It reports no
 *   confidence, so pages read this way have `confidence: null`.
 * - `tesseract` (default): tesseract.js (WASM, CPU). Needs no GPU. Also the
 *   fallback when the vision model fails, runs away, or returns nothing.
 *
 * Tesseract language data (~12 MB for eng+hin; English first keeps Latin
 * digits accurate) is downloaded on first use and cached in
 * `.cache/tesseract`. The folder must exist: tesseract.js silently skips the
 * cache write otherwise and downloads the data again on every document.
 * For an offline install, copy `eng.traineddata` + `hin.traineddata` there.
 */
export const OCR_LANGS = process.env.OCR_LANGS ?? 'eng+hin';
const OCR_ENGINE = (process.env.OCR_ENGINE ?? 'tesseract').toLowerCase();
const OCR_MODEL = process.env.OCR_MODEL ?? 'qwen3-vl:8b-instruct';
const OLLAMA_URL =
  process.env.OLLAMA_API_ENDPOINT ??
  process.env.OLLAMA_ENDPOINT ??
  'http://localhost:11434';
/** Upper bound on generated tokens per page; a dense A4 page is ~1.5-2.5k. */
const OCR_MAX_TOKENS = Number(process.env.OCR_MAX_TOKENS ?? 4096);
const TESSERACT_CACHE = join(process.cwd(), '.cache', 'tesseract');

const OCR_PROMPT = [
  'Transcribe all printed text on this document page exactly as written, in reading order.',
  'Keep Hindi in Devanagari and English in English. Do not translate, summarise or correct anything.',
  'Keep line breaks and numbering. Write tables row by row with " | " between cells.',
  'Ignore handwritten notes, signatures and rubber stamps.',
  'Output only the transcribed text. If the page is blank, output nothing.',
].join('\n');

const logger = new Logger('OCR');

export interface OcrPageResult {
  text: string;
  /** Tesseract mean confidence 0-100; null when a vision model read the page. */
  confidence: number | null;
  engine: 'ollama' | 'tesseract';
}

export type OcrFn = (image: Uint8Array) => Promise<OcrPageResult>;

export const ocrEngine = () => (OCR_ENGINE === 'ollama' ? 'ollama' : 'tesseract');

/**
 * Gives `fn` an OCR function for the pages of one document. The tesseract
 * worker is created lazily (only if needed) and terminated afterwards, so OCR
 * memory is released between uploads.
 */
export async function withOcr<T>(fn: (ocr: OcrFn) => Promise<T>): Promise<T> {
  let worker: Worker | undefined;
  const tesseract = async (image: Uint8Array): Promise<OcrPageResult> => {
    if (!worker) {
      mkdirSync(TESSERACT_CACHE, { recursive: true });
      worker = await createWorker(OCR_LANGS.split('+'), undefined, {
        cachePath: TESSERACT_CACHE,
      });
    }
    const { data } = await worker.recognize(Buffer.from(image));
    return { text: data.text, confidence: data.confidence, engine: 'tesseract' };
  };

  const ocr: OcrFn = async (image) => {
    if (ocrEngine() !== 'ollama') return tesseract(image);
    try {
      return await visionOcr(image);
    } catch (err) {
      logger.warn(`${OCR_MODEL} failed (${(err as Error).message}); using tesseract`);
      return tesseract(image);
    }
  };

  try {
    return await fn(ocr);
  } finally {
    await worker?.terminate();
  }
}

async function visionOcr(image: Uint8Array): Promise<OcrPageResult> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: OCR_MODEL,
      stream: false,
      think: false,
      keep_alive: '10m',
      messages: [
        {
          role: 'user',
          content: OCR_PROMPT,
          images: [Buffer.from(image).toString('base64')],
        },
      ],
      options: {
        temperature: 0,
        num_ctx: 8192,
        num_predict: OCR_MAX_TOKENS,
        // Vision models can loop on ruled tables / repeated headers.
        repeat_penalty: 1.05,
      },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    message?: { content?: string };
    done_reason?: string;
  };
  const text = stripFences(body.message?.content ?? '');
  // Hitting the token cap almost always means a repetition loop.
  if (body.done_reason === 'length') throw new Error('output hit the token limit');
  if (looksLooped(text)) throw new Error('repetitive output');
  return { text, confidence: null, engine: 'ollama' };
}

/** Models sometimes wrap the transcription in a ``` block. */
function stripFences(text: string): string {
  return text
    .replace(/^\s*```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/** True when a few lines make up most of the output (a generation loop). */
export function looksLooped(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
  if (lines.length < 20) return false;
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const top = Math.max(...counts.values());
  return top / lines.length > 0.3;
}
