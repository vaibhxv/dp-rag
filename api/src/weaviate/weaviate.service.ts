import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import weaviate, { WeaviateClient, configure } from 'weaviate-client';

export const DOCUMENT_COLLECTION = 'Document';
export const CHUNK_COLLECTION = 'DocumentChunk';

export type DocumentProps = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  /** Pages whose text came from OCR (scanned pages). */
  ocrPageCount: number;
  chunkCount: number;
  status: 'processing' | 'ready' | 'failed';
  error: string;
  uploadedAt: Date;
};

export type ChunkProps = {
  text: string;
  documentId: string;
  filename: string;
  page: number;
  chunkIndex: number;
  /** Passage text came from OCR; shown as an extraction-quality hint. */
  ocr: boolean;
};

/**
 * Owns the Weaviate connection and the schema.
 *
 * - `Document` holds per-file metadata only (no vectorizer).
 * - `DocumentChunk` holds the searchable passages. Weaviate vectorizes `text`
 *   itself through `text2vec-ollama` (local multilingual embedding model),
 *   keeps a BM25 index for keyword/hybrid search, and runs RAG through
 *   `generative-ollama` (local LLM).
 */
@Injectable()
export class WeaviateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeaviateService.name);
  private _client?: WeaviateClient;

  constructor(private readonly config: ConfigService) {}

  get client(): WeaviateClient {
    if (!this._client) {
      throw new Error('Weaviate client is not connected yet');
    }
    return this._client;
  }

  documents() {
    return this.client.collections.use<
      typeof DOCUMENT_COLLECTION,
      DocumentProps
    >(DOCUMENT_COLLECTION);
  }

  chunks() {
    return this.client.collections.use<typeof CHUNK_COLLECTION, ChunkProps>(
      CHUNK_COLLECTION,
    );
  }

  async onModuleInit() {
    this._client = await weaviate.connectToLocal({
      host: this.config.get('WEAVIATE_HOST', 'localhost'),
      port: Number(this.config.get('WEAVIATE_HTTP_PORT', 8080)),
      grpcPort: Number(this.config.get('WEAVIATE_GRPC_PORT', 50051)),
      // Local CPU inference (embeddings + LLM) is slow; be generous.
      timeout: { init: 30, query: 300, insert: 300 },
    });
    await this.ensureSchema();
    this.logger.log('Connected to Weaviate and schema is ready');
  }

  async onModuleDestroy() {
    await this._client?.close();
  }

  async isReady(): Promise<boolean> {
    try {
      return await this.client.isReady();
    } catch {
      return false;
    }
  }

  private async ensureSchema() {
    const client = this.client;

    if (!(await client.collections.exists(DOCUMENT_COLLECTION))) {
      await client.collections.create({
        name: DOCUMENT_COLLECTION,
        vectorizers: configure.vectors.selfProvided(),
        properties: [
          { name: 'filename', dataType: 'text' },
          { name: 'mimeType', dataType: 'text', skipVectorization: true },
          { name: 'sizeBytes', dataType: 'int' },
          { name: 'sha256', dataType: 'text', tokenization: 'field' },
          { name: 'pageCount', dataType: 'int' },
          { name: 'ocrPageCount', dataType: 'int' },
          { name: 'chunkCount', dataType: 'int' },
          { name: 'status', dataType: 'text', tokenization: 'field' },
          { name: 'error', dataType: 'text' },
          { name: 'uploadedAt', dataType: 'date' },
        ],
      });
      this.logger.log(`Created collection ${DOCUMENT_COLLECTION}`);
    }

    if (!(await client.collections.exists(CHUNK_COLLECTION))) {
      // Called by Weaviate (not this API), so it must be reachable from Weaviate.
      const ollamaEndpoint = this.config.get<string>(
        'OLLAMA_ENDPOINT',
        'http://localhost:11434',
      );
      await client.collections.create({
        name: CHUNK_COLLECTION,
        vectorizers: configure.vectors.text2VecOllama({
          // Only the passage body is embedded; metadata stays out of the vector.
          sourceProperties: ['text'],
          apiEndpoint: ollamaEndpoint,
          model: this.config.get(
            'OLLAMA_EMBED_MODEL',
            'paraphrase-multilingual',
          ),
        }),
        generative: configure.generative.ollama({
          apiEndpoint: ollamaEndpoint,
          model: this.config.get('OLLAMA_MODEL', 'qwen2.5:1.5b'),
        }),
        properties: [
          { name: 'text', dataType: 'text' },
          {
            name: 'documentId',
            dataType: 'text',
            tokenization: 'field',
            skipVectorization: true,
          },
          { name: 'filename', dataType: 'text', skipVectorization: true },
          { name: 'page', dataType: 'int' },
          { name: 'chunkIndex', dataType: 'int' },
          { name: 'ocr', dataType: 'boolean' },
        ],
      });
      this.logger.log(`Created collection ${CHUNK_COLLECTION}`);
    }
  }
}
