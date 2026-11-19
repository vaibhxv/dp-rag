import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentProps } from '../weaviate/weaviate.service.js';
import { WeaviateService } from '../weaviate/weaviate.service.js';
import { chunkPages } from './chunker.js';
import { parseDocument, UnsupportedFileError } from './parser.js';

export interface DocumentDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  ocrPageCount: number;
  chunkCount: number;
  status: string;
  error: string;
  uploadedAt: string;
}

const INSERT_BATCH_SIZE = 100;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(private readonly weaviate: WeaviateService) {}

  /**
   * Upload -> validate -> extract -> chunk -> insert into Weaviate.
   * Weaviate vectorizes each chunk on insert via text2vec-transformers.
   * Runs synchronously for the MVP (no job queue).
   */
  async ingest(file: Express.Multer.File): Promise<DocumentDto> {
    // Multer decodes multipart filenames as latin1; restore UTF-8 (Hindi etc.).
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const documents = this.weaviate.documents();
    const duplicate = await documents.query.fetchObjects({
      filters: documents.filter.byProperty('sha256').equal(sha256),
      limit: 1,
    });
    if (duplicate.objects.length > 0) {
      throw new ConflictException(
        `"${filename}" was already ingested as "${duplicate.objects[0].properties.filename}"`,
      );
    }

    let parsed;
    try {
      parsed = await parseDocument(filename, file.buffer);
    } catch (err) {
      if (err instanceof UnsupportedFileError) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(
        `Could not read "${filename}": ${(err as Error).message}`,
      );
    }

    const chunks = chunkPages(parsed.pages);
    const ocrPages = new Set(
      parsed.pages.filter((p) => p.ocr).map((p) => p.page),
    );
    if (chunks.length === 0) {
      throw new BadRequestException(
        `No extractable text found in "${filename}" (OCR also found no readable text).`,
      );
    }

    const documentId = await documents.data.insert({
      filename,
      mimeType: parsed.mimeType,
      sizeBytes: file.size,
      sha256,
      pageCount: parsed.pages.length,
      ocrPageCount: parsed.pages.filter((p) => p.ocr).length,
      chunkCount: 0,
      status: 'processing',
      error: '',
      uploadedAt: new Date(),
    });

    try {
      const chunkCollection = this.weaviate.chunks();
      for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + INSERT_BATCH_SIZE).map((c) => ({
          text: c.text,
          documentId,
          filename,
          page: c.page,
          chunkIndex: c.chunkIndex,
          ocr: ocrPages.has(c.page),
        }));
        const res = await chunkCollection.data.insertMany(batch);
        if (res.hasErrors) {
          const first = Object.values(res.errors)[0];
          throw new Error(first?.message ?? 'unknown insert error');
        }
      }

      await documents.data.update({
        id: documentId,
        properties: { status: 'ready', chunkCount: chunks.length },
      });
      this.logger.log(`Ingested "${filename}" -> ${chunks.length} chunks`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Ingestion failed for "${filename}": ${message}`);
      await this.deleteChunks(documentId);
      await documents.data.update({
        id: documentId,
        properties: { status: 'failed', error: message },
      });
    }

    return this.get(documentId);
  }

  async list(): Promise<DocumentDto[]> {
    const documents = this.weaviate.documents();
    const res = await documents.query.fetchObjects({ limit: 1000 });
    return res.objects
      .map((o) => toDto(o.uuid, o.properties))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async get(id: string): Promise<DocumentDto> {
    const obj = await this.weaviate.documents().query.fetchObjectById(id);
    if (!obj) throw new NotFoundException(`Document ${id} not found`);
    return toDto(obj.uuid, obj.properties);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.deleteChunks(id);
    await this.weaviate.documents().data.deleteById(id);
  }

  private async deleteChunks(documentId: string) {
    const chunks = this.weaviate.chunks();
    await chunks.data.deleteMany(
      chunks.filter.byProperty('documentId').equal(documentId),
    );
  }
}

function toDto(id: string, p: Partial<DocumentProps>): DocumentDto {
  const uploadedAt = p.uploadedAt as Date | string | undefined;
  return {
    id,
    filename: p.filename ?? '',
    mimeType: p.mimeType ?? '',
    sizeBytes: p.sizeBytes ?? 0,
    sha256: p.sha256 ?? '',
    pageCount: p.pageCount ?? 0,
    ocrPageCount: p.ocrPageCount ?? 0,
    chunkCount: p.chunkCount ?? 0,
    status: p.status ?? '',
    error: p.error ?? '',
    uploadedAt:
      uploadedAt instanceof Date
        ? uploadedAt.toISOString()
        : (uploadedAt ?? ''),
  };
}
