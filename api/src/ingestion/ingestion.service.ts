import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service.js';
import {
  type DocumentRecord,
  StoreService,
} from '../store/store.service.js';
import { WeaviateService } from '../weaviate/weaviate.service.js';
import { chunkPages } from './chunker.js';
import { describeDocument } from './describe.js';
import {
  parseDocument,
  renderThumbnail,
  SUPPORTED_EXTENSIONS,
} from './parser.js';

const INSERT_BATCH_SIZE = 100;

/** Upload rejected because the same file (same SHA-256) is already stored. */
export class DuplicateDocumentError extends ConflictException {
  constructor(
    filename: string,
    readonly existing: DocumentRecord,
  ) {
    super(`"${filename}" was already ingested as "${existing.filename}"`);
  }
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/**
 * Ingestion runs in the background:
 *   upload -> SQLite (original file, status "queued") -> respond immediately
 *   worker: parse/OCR -> describe (LLM) -> chunk -> Weaviate (vectorized on insert)
 *
 * One document at a time (OCR and the LLM are CPU heavy on a laptop).
 * Queued work survives an API restart: it is picked up again on boot.
 */
@Injectable()
export class IngestionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionService.name);
  private readonly queue: string[] = [];
  private running = false;

  constructor(
    private readonly store: StoreService,
    private readonly weaviate: WeaviateService,
    private readonly ollama: OllamaService,
  ) {}

  onApplicationBootstrap() {
    const pending = this.store.listByStatus('processing', 'queued');
    if (pending.length) {
      this.logger.log(`Resuming ${pending.length} unfinished document(s)`);
      for (const doc of pending) this.enqueue(doc.id);
    }
  }

  /** Validates and stores the upload; processing continues in the background. */
  accept(file: Express.Multer.File): DocumentRecord {
    // Multer decodes multipart filenames as latin1; restore UTF-8 (Hindi etc.).
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = extname(filename).toLowerCase();
    if (!MIME_TYPES[ext]) {
      throw new BadRequestException(
        `Unsupported file type "${ext || 'unknown'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = this.store.findBySha(sha256);
    if (duplicate) throw new DuplicateDocumentError(filename, duplicate);
    const doc = this.store.insertDocument(
      {
        id: randomUUID(),
        filename,
        mimeType: MIME_TYPES[ext],
        sizeBytes: file.size,
        sha256,
      },
      file.buffer,
    );
    this.enqueue(doc.id);
    return doc;
  }

  list(): DocumentRecord[] {
    return this.store.listDocuments();
  }

  get(id: string): DocumentRecord {
    const doc = this.store.getDocument(id);
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  file(id: string): { doc: DocumentRecord; data: Buffer } {
    const doc = this.get(id);
    const data = this.store.getFile(id);
    if (!data) throw new NotFoundException(`File for ${id} not found`);
    return { doc, data };
  }

  /** Page-1 thumbnail for PDFs, rendered on first request and cached in SQLite. */
  async thumbnail(id: string): Promise<Buffer | null> {
    const doc = this.get(id);
    const cached = this.store.getThumbnail(id);
    if (cached) return cached;
    if (doc.mimeType !== 'application/pdf') return null;
    const data = this.store.getFile(id);
    if (!data) return null;
    const png = await renderThumbnail(data);
    if (png) this.store.saveThumbnail(id, png);
    return png;
  }

  pages(id: string) {
    this.get(id);
    return this.store.getPages(id);
  }

  /** Re-runs the LLM title/summary/questions from the stored page text. */
  async redescribe(id: string): Promise<DocumentRecord> {
    const doc = this.get(id);
    const pages = this.store.getPages(id);
    const description = await describeDocument(
      this.ollama,
      doc.filename,
      pages.map((p) => p.text).join('\n\n'),
    );
    this.store.updateDocument(id, description);
    // Keep the title shown on search results in sync.
    const chunks = this.weaviate.chunks();
    const res = await chunks.query.fetchObjects({
      filters: chunks.filter.byProperty('documentId').equal(id),
      limit: 1000,
    });
    for (const o of res.objects) {
      await chunks.data.update({ id: o.uuid, properties: { title: description.title } });
    }
    return this.get(id);
  }

  /**
   * Re-runs the whole pipeline (text/OCR -> describe -> chunk -> embed) on the
   * stored original, keeping the document id. Use after changing the OCR
   * engine or the embedding model.
   */
  reprocess(id: string): DocumentRecord {
    this.get(id);
    this.store.updateDocument(id, { status: 'queued', progress: 'Waiting in queue', error: '' });
    this.enqueue(id);
    return this.get(id);
  }

  reprocessAll(): DocumentRecord[] {
    return this.store.listDocuments().map((d) => this.reprocess(d.id));
  }

  async remove(id: string): Promise<void> {
    this.get(id);
    const i = this.queue.indexOf(id);
    if (i >= 0) this.queue.splice(i, 1);
    await this.deleteChunks(id);
    this.store.deleteDocument(id);
  }

  private enqueue(id: string) {
    if (!this.queue.includes(id)) this.queue.push(id);
    void this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      let id: string | undefined;
      while ((id = this.queue.shift())) {
        await this.process(id);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(id: string) {
    const doc = this.store.getDocument(id);
    const data = this.store.getFile(id);
    if (!doc || !data) return; // deleted while queued

    const started = Date.now();
    const setProgress = (progress: string) =>
      this.store.updateDocument(id, { status: 'processing', progress });

    try {
      setProgress('Reading text');
      await this.deleteChunks(id); // idempotent when resuming after a restart
      const parsed = await parseDocument(doc.filename, data, setProgress);
      const ocrPages = parsed.pages.filter((p) => p.ocr);
      const confidences = ocrPages
        .map((p) => p.ocrConfidence)
        .filter((c): c is number => c !== null);
      this.store.replacePages(id, parsed.pages);
      this.store.updateDocument(id, {
        pageCount: parsed.pages.length,
        ocrPageCount: ocrPages.length,
        ocrConfidence: confidences.length
          ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          : null,
      });

      const chunks = chunkPages(parsed.pages);
      if (chunks.length === 0) {
        throw new Error('No readable text found (OCR also found none).');
      }

      setProgress('Summarising with the local LLM');
      const description = await describeDocument(
        this.ollama,
        doc.filename,
        parsed.pages.map((p) => p.text).join('\n\n'),
      );
      this.store.updateDocument(id, description);

      setProgress(`Embedding ${chunks.length} passages`);
      const ocrSet = new Set(ocrPages.map((p) => p.page));
      const collection = this.weaviate.chunks();
      for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + INSERT_BATCH_SIZE).map((c) => ({
          text: c.text,
          documentId: id,
          filename: doc.filename,
          title: description.title,
          page: c.page,
          chunkIndex: c.chunkIndex,
          ocr: ocrSet.has(c.page),
        }));
        const res = await collection.data.insertMany(batch);
        if (res.hasErrors) {
          const first = Object.values(res.errors)[0];
          throw new Error(first?.message ?? 'unknown insert error');
        }
      }

      this.store.updateDocument(id, {
        status: 'ready',
        progress: '',
        error: '',
        chunkCount: chunks.length,
        processedAt: new Date().toISOString(),
      });
      this.logger.log(
        `Ingested "${doc.filename}": ${parsed.pages.length} pages (${ocrPages.length} OCR), ${chunks.length} chunks in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Ingestion failed for "${doc.filename}": ${message}`);
      await this.deleteChunks(id).catch(() => undefined);
      this.store.updateDocument(id, {
        status: 'failed',
        progress: '',
        error: message,
      });
    }
  }

  private async deleteChunks(documentId: string) {
    const chunks = this.weaviate.chunks();
    await chunks.data.deleteMany(
      chunks.filter.byProperty('documentId').equal(documentId),
    );
  }
}
