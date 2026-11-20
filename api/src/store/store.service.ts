import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

export const CATEGORIES = [
  'Notification',
  'Circular / Order',
  'Guidelines / SOP',
  'Tender / Procurement',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  ocrPageCount: number;
  /** Mean OCR confidence over OCR'd pages (0-100), null if no OCR. */
  ocrConfidence: number | null;
  chunkCount: number;
  status: DocumentStatus;
  /** Human-readable step while queued/processing, e.g. "OCR page 3 of 12". */
  progress: string;
  error: string;
  title: string;
  summary: string;
  category: Category | '';
  /** Example questions this document can answer (shown as suggestions). */
  questions: string[];
  uploadedAt: string;
  processedAt: string | null;
}

export interface PageRecord {
  page: number;
  text: string;
  ocr: boolean;
  ocrConfidence: number | null;
}

type Row = Record<string, string | number | null>;

/**
 * Local SQLite database (Node's built-in `node:sqlite`, no native addon).
 *
 * Source of truth for documents: metadata, ingestion status, the ORIGINAL
 * uploaded file (BLOB) and the extracted text of every page. Weaviate only
 * holds the searchable chunks and their vectors.
 */
@Injectable()
export class StoreService implements OnModuleDestroy {
  private readonly logger = new Logger(StoreService.name);
  private readonly db: DatabaseSync;

  constructor(config: ConfigService) {
    const dir = resolve(config.get<string>('DATA_DIR', './data'));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'knowledge.db');
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE,
        page_count INTEGER NOT NULL DEFAULT 0,
        ocr_page_count INTEGER NOT NULL DEFAULT 0,
        ocr_confidence INTEGER,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        progress TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        questions TEXT NOT NULL DEFAULT '[]',
        uploaded_at TEXT NOT NULL,
        processed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        data BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pages (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        page INTEGER NOT NULL,
        text TEXT NOT NULL,
        ocr INTEGER NOT NULL,
        ocr_confidence INTEGER,
        PRIMARY KEY (document_id, page)
      );
    `);
    this.logger.log(`SQLite store at ${file}`);
  }

  onModuleDestroy() {
    this.db.close();
  }

  insertDocument(
    doc: Pick<
      DocumentRecord,
      'id' | 'filename' | 'mimeType' | 'sizeBytes' | 'sha256'
    >,
    file: Buffer,
  ): DocumentRecord {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO documents (id, filename, mime_type, size_bytes, sha256, status, progress, uploaded_at)
           VALUES (?, ?, ?, ?, ?, 'queued', 'Waiting in queue', ?)`,
        )
        .run(
          doc.id,
          doc.filename,
          doc.mimeType,
          doc.sizeBytes,
          doc.sha256,
          new Date().toISOString(),
        );
      this.db
        .prepare('INSERT INTO files (document_id, data) VALUES (?, ?)')
        .run(doc.id, file);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return this.getDocument(doc.id)!;
  }

  findBySha(sha256: string): DocumentRecord | null {
    const row = this.db
      .prepare('SELECT * FROM documents WHERE sha256 = ?')
      .get(sha256) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  getDocument(id: string): DocumentRecord | null {
    const row = this.db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  listDocuments(): DocumentRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM documents ORDER BY uploaded_at DESC, filename')
        .all() as Row[]
    ).map(toRecord);
  }

  listByStatus(...statuses: DocumentStatus[]): DocumentRecord[] {
    const marks = statuses.map(() => '?').join(',');
    return (
      this.db
        .prepare(
          `SELECT * FROM documents WHERE status IN (${marks}) ORDER BY uploaded_at, filename`,
        )
        .all(...statuses) as Row[]
    ).map(toRecord);
  }

  updateDocument(
    id: string,
    patch: Partial<Omit<DocumentRecord, 'id' | 'sha256' | 'uploadedAt'>>,
  ) {
    const columns: Record<string, string> = {
      filename: 'filename',
      mimeType: 'mime_type',
      sizeBytes: 'size_bytes',
      pageCount: 'page_count',
      ocrPageCount: 'ocr_page_count',
      ocrConfidence: 'ocr_confidence',
      chunkCount: 'chunk_count',
      status: 'status',
      progress: 'progress',
      error: 'error',
      title: 'title',
      summary: 'summary',
      category: 'category',
      questions: 'questions',
      processedAt: 'processed_at',
    };
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const col = columns[key];
      if (!col || value === undefined) continue;
      sets.push(`${col} = ?`);
      values.push(
        key === 'questions'
          ? JSON.stringify(value)
          : (value as string | number | null),
      );
    }
    if (!sets.length) return;
    this.db
      .prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values, id);
  }

  deleteDocument(id: string) {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  getFile(id: string): Buffer | null {
    const row = this.db
      .prepare('SELECT data FROM files WHERE document_id = ?')
      .get(id) as { data: Uint8Array } | undefined;
    return row ? Buffer.from(row.data) : null;
  }

  replacePages(id: string, pages: PageRecord[]) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM pages WHERE document_id = ?').run(id);
      const insert = this.db.prepare(
        'INSERT INTO pages (document_id, page, text, ocr, ocr_confidence) VALUES (?, ?, ?, ?, ?)',
      );
      for (const p of pages) {
        insert.run(id, p.page, p.text, p.ocr ? 1 : 0, p.ocrConfidence);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getPages(id: string): PageRecord[] {
    return (
      this.db
        .prepare(
          'SELECT page, text, ocr, ocr_confidence FROM pages WHERE document_id = ? ORDER BY page',
        )
        .all(id) as Row[]
    ).map((r) => ({
      page: Number(r.page),
      text: String(r.text),
      ocr: Number(r.ocr) === 1,
      ocrConfidence: r.ocr_confidence === null ? null : Number(r.ocr_confidence),
    }));
  }

  stats() {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS documents,
                COALESCE(SUM(page_count), 0) AS pages,
                COALESCE(SUM(chunk_count), 0) AS chunks,
                COALESCE(SUM(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END), 0) AS pending
         FROM documents`,
      )
      .get() as Row;
    return {
      documents: Number(row.documents),
      pages: Number(row.pages),
      chunks: Number(row.chunks),
      pending: Number(row.pending),
    };
  }
}

function toRecord(r: Row): DocumentRecord {
  let questions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(r.questions ?? '[]'));
    if (Array.isArray(parsed)) questions = parsed.map(String);
  } catch {
    questions = [];
  }
  return {
    id: String(r.id),
    filename: String(r.filename),
    mimeType: String(r.mime_type),
    sizeBytes: Number(r.size_bytes),
    sha256: String(r.sha256),
    pageCount: Number(r.page_count),
    ocrPageCount: Number(r.ocr_page_count),
    ocrConfidence: r.ocr_confidence === null ? null : Number(r.ocr_confidence),
    chunkCount: Number(r.chunk_count),
    status: String(r.status) as DocumentStatus,
    progress: String(r.progress ?? ''),
    error: String(r.error ?? ''),
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    category: String(r.category ?? '') as Category | '',
    questions,
    uploadedAt: String(r.uploaded_at),
    processedAt: r.processed_at === null ? null : String(r.processed_at),
  };
}
