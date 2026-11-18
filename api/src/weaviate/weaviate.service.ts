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
};

/**
 * Owns the Weaviate connection and the schema.
 *
 * - `Document` holds per-file metadata only (no vectorizer).
 * - `DocumentChunk` holds the searchable passages. Weaviate vectorizes `text`
 *   itself through the self-hosted `text2vec-transformers` module, keeps a BM25
 *   index for keyword/hybrid search, and runs RAG through `generative-ollama`.
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
          { name: 'chunkCount', dataType: 'int' },
          { name: 'status', dataType: 'text', tokenization: 'field' },
          { name: 'error', dataType: 'text' },
          { name: 'uploadedAt', dataType: 'date' },
        ],
      });
      this.logger.log(`Created collection ${DOCUMENT_COLLECTION}`);
    }

    if (!(await client.collections.exists(CHUNK_COLLECTION))) {
      await client.collections.create({
        name: CHUNK_COLLECTION,
        vectorizers: configure.vectors.text2VecTransformers({
          // Only the passage body is embedded; metadata stays out of the vector.
          sourceProperties: ['text'],
        }),
        generative: configure.generative.ollama({
          apiEndpoint: this.config.get(
            'OLLAMA_ENDPOINT',
            'http://ollama:11434',
          ),
          model: this.config.get('OLLAMA_MODEL', 'llama3.2'),
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
        ],
      });
      this.logger.log(`Created collection ${CHUNK_COLLECTION}`);
    }
  }
}
