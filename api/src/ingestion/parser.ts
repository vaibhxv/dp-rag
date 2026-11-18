import { extname } from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { PageText } from './chunker.js';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

export class UnsupportedFileError extends Error {}

export interface ParsedDocument {
  pages: PageText[];
  mimeType: string;
}

/**
 * Extracts text from an uploaded file, preserving page boundaries where the
 * format has them (PDF). DOCX/TXT/MD are treated as a single logical page.
 *
 * Scanned PDFs (no text layer) will come back empty; OCR is out of MVP scope.
 */
export async function parseDocument(
  filename: string,
  buffer: Buffer,
): Promise<ParsedDocument> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return {
          mimeType: 'application/pdf',
          pages: result.pages.map((p) => ({ page: p.num, text: p.text })),
        };
      } finally {
        await parser.destroy();
      }
    }
    case '.docx': {
      const { value } = await mammoth.extractRawText({ buffer });
      return {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pages: [{ page: 1, text: value }],
      };
    }
    case '.txt':
    case '.md':
      return {
        mimeType: ext === '.md' ? 'text/markdown' : 'text/plain',
        pages: [{ page: 1, text: buffer.toString('utf8') }],
      };
    default:
      throw new UnsupportedFileError(
        `Unsupported file type "${ext || 'unknown'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
  }
}
