import { join } from 'node:path';
import { createWorker } from 'tesseract.js';

/**
 * OCR via tesseract.js (WASM). No system install needed. Language data
 * (~25 MB for eng+hin; English first keeps Latin digits accurate) is downloaded on first use and cached locally.
 *
 * A worker is created per document and terminated afterwards, so OCR memory
 * is released between uploads (matters on small machines).
 */
export const OCR_LANGS = process.env.OCR_LANGS ?? 'eng+hin';

export interface OcrPageResult {
  text: string;
  /** Tesseract mean confidence 0-100. */
  confidence: number;
}

export async function withOcr<T>(
  fn: (ocr: (image: Uint8Array) => Promise<OcrPageResult>) => Promise<T>,
): Promise<T> {
  const worker = await createWorker(OCR_LANGS.split('+'), undefined, {
    cachePath: join(process.cwd(), '.cache', 'tesseract'),
  });
  try {
    return await fn(async (image) => {
      const { data } = await worker.recognize(Buffer.from(image));
      return { text: data.text, confidence: data.confidence };
    });
  } finally {
    await worker.terminate();
  }
}
