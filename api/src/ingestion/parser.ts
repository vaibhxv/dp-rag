import { extname } from 'node:path';
import { Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { PageText } from './chunker.js';
import { withOcr } from './ocr.js';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

/** A PDF page with fewer non-whitespace characters than this is treated as scanned. */
const MIN_TEXT_CHARS_PER_PAGE = 25;
/** Render scale for OCR (3x of 72dpi ≈ 216dpi). Measured better than 2x at ~same speed. */
const OCR_RENDER_SCALE = 3;

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
export async function parseDocument(
  filename: string,
  buffer: Buffer,
): Promise<ParsedDocument> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf':
      return { mimeType: 'application/pdf', pages: await parsePdf(buffer) };
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

async function parsePdf(buffer: Buffer): Promise<ParsedPage[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { pages } = await parser.getText();
    const result: ParsedPage[] = pages.map((p) => textPage(p.num, p.text));

    const scanned = result.filter(
      (p) => p.text.replace(/\s+/g, '').length < MIN_TEXT_CHARS_PER_PAGE,
    );
    if (scanned.length === 0) return result;

    logger.log(`OCR needed for ${scanned.length}/${result.length} page(s)`);
    await withOcr(async (ocr) => {
      for (const page of scanned) {
        const shot = await parser.getScreenshot({
          partial: [page.page],
          scale: OCR_RENDER_SCALE,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const image = shot.pages[0]?.data;
        if (!image) continue;
        const started = Date.now();
        const { text, confidence } = await ocr(image);
        page.text = text;
        page.ocr = true;
        page.ocrConfidence = Math.round(confidence);
        logger.log(
          `OCR page ${page.page}: ${text.length} chars, confidence ${page.ocrConfidence}% (${Date.now() - started} ms)`,
        );
      }
    });
    return result;
  } finally {
    await parser.destroy();
  }
}

function textPage(page: number, text: string): ParsedPage {
  return { page, text, ocr: false, ocrConfidence: null };
}
