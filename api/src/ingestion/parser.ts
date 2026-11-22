import { extname } from 'node:path';
import { Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { PageText } from './chunker.js';
import { ocrEngine, withOcr } from './ocr.js';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

/** A PDF page with fewer non-whitespace characters than this is treated as scanned. */
const MIN_TEXT_CHARS_PER_PAGE = 25;
/**
 * Render scale for OCR. Tesseract: 3x of 72dpi ≈ 216dpi (measured better than
 * 2x at ~same speed). Vision models resize internally; 2x (≈144dpi) keeps the
 * image token count (and GPU time) reasonable with no loss on printed text.
 */
const OCR_RENDER_SCALE = Number(
  process.env.OCR_RENDER_SCALE ?? (ocrEngine() === 'ollama' ? 2 : 3),
);

const logger = new Logger('Parser');

export class UnsupportedFileError extends Error {}

export interface ParsedPage extends PageText {
  /** True when the page text came from OCR instead of the PDF text layer. */
  ocr: boolean;
  /** OCR mean confidence (0-100), null for text-layer pages. */
  ocrConfidence: number | null;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  mimeType: string;
}

/**
 * Extracts text from an uploaded file, preserving page boundaries where the
 * format has them (PDF). DOCX/TXT/MD are treated as a single logical page.
 *
 * PDF pages without a usable text layer (scans) are rendered to an image and
 * OCR'd (Hindi + English by default).
 */
export type ProgressFn = (message: string) => void;

export async function parseDocument(
  filename: string,
  buffer: Buffer,
  onProgress: ProgressFn = () => {},
): Promise<ParsedDocument> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf':
      return { mimeType: 'application/pdf', pages: await parsePdf(buffer, onProgress) };
    case '.docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pages: [textPage(1, value)],
      };
    }
    case '.txt':
    case '.md':
      return {
        mimeType: ext === '.md' ? 'text/markdown' : 'text/plain',
        pages: [textPage(1, buffer.toString('utf8'))],
      };
    default:
      throw new UnsupportedFileError(
        `Unsupported file type "${ext || 'unknown'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
  }
}

async function parsePdf(
  buffer: Buffer,
  onProgress: ProgressFn,
): Promise<ParsedPage[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { pages } = await parser.getText();
    const result: ParsedPage[] = pages.map((p) => textPage(p.num, p.text));

    const scanned = result.filter((p) => needsOcr(p.text));
    if (scanned.length === 0) return result;

    logger.log(`OCR needed for ${scanned.length}/${result.length} page(s)`);
    onProgress('Starting OCR');
    await withOcr(async (ocr) => {
      for (const [i, page] of scanned.entries()) {
        onProgress(`OCR page ${i + 1} of ${scanned.length}`);
        const started = Date.now();
        try {
          const shot = await parser.getScreenshot({
            partial: [page.page],
            scale: OCR_RENDER_SCALE,
            imageDataUrl: false,
            imageBuffer: true,
          });
          const image = shot.pages[0]?.data;
          if (!image) continue;
          const { text, confidence, engine } = await ocr(image);
          // Keep a (garbled) text layer rather than replacing it with nothing.
          if (!text.trim() && page.text.trim()) continue;
          page.text = text;
          page.ocr = true;
          // Blank pages score 0 and would drag the document average down.
          page.ocrConfidence =
            confidence === null || !text.trim() ? null : Math.round(confidence);
          logger.log(
            `OCR page ${page.page} (${engine}): ${text.length} chars` +
              (page.ocrConfidence !== null ? `, confidence ${page.ocrConfidence}%` : '') +
              ` (${Date.now() - started} ms)`,
          );
        } catch (err) {
          // One unreadable page must not fail the whole document.
          logger.warn(`OCR failed on page ${page.page}: ${(err as Error).message}`);
        }
      }
    });
    return result;
  } finally {
    await parser.destroy();
  }
}

/**
 * A page needs OCR when its text layer is missing or unusable:
 * - (almost) no text: a scan;
 * - broken Devanagari: many Indian government PDFs embed Hindi fonts with a
 *   bad Unicode map, so extraction yields e.g. "रािपत्र" for "राजपत्र".
 *   Two vowel signs in a row never occur in real Hindi, so they mark it;
 * - mostly private-use / replacement characters (unmapped legacy fonts).
 */
export function needsOcr(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < MIN_TEXT_CHARS_PER_PAGE) return true;
  const devanagari = (compact.match(/[ऀ-ॿ]/g) ?? []).length;
  const brokenPairs = (compact.match(/[ा-ौ][ा-ौ]/g) ?? []).length;
  if (devanagari >= 40 && brokenPairs >= 3 && brokenPairs / devanagari > 0.005) {
    return true;
  }
  const unmapped = (compact.match(/[-�]/g) ?? []).length;
  return unmapped / compact.length > 0.1;
}

function textPage(page: number, text: string): ParsedPage {
  return { page, text, ocr: false, ocrConfidence: null };
}

/** Renders page 1 of a PDF as a small PNG (library card thumbnail). */
export async function renderThumbnail(
  buffer: Buffer,
  width = 320,
): Promise<Buffer | null> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const shot = await parser.getScreenshot({
      partial: [1],
      desiredWidth: width,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const data = shot.pages[0]?.data;
    return data ? Buffer.from(data) : null;
  } finally {
    await parser.destroy();
  }
}
