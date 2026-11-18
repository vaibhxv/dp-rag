import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChunkProps } from '../weaviate/weaviate.service.js';
import { WeaviateService } from '../weaviate/weaviate.service.js';
import type { AskDto, SearchDto } from './search.dto.js';

export interface Passage {
  id: string;
  documentId: string;
  filename: string;
  page: number;
  chunkIndex: number;
  text: string;
  /** Hybrid/BM25 score (higher is better) or 1 - cosine distance for semantic. */
  score: number | null;
}

export interface SearchResponse {
  query: string;
  mode: SearchDto['mode'];
  passages: Passage[];
  tookMs: number;
}

export interface AskResponse extends SearchResponse {
  answer: string | null;
}

const RETURN_PROPS: (keyof ChunkProps)[] = [
  'text',
  'documentId',
  'filename',
  'page',
  'chunkIndex',
];

/**
 * The grouped task receives every retrieved passage (text + filename + page)
 * as context. The prompt pins the model to that context so answers stay
 * source-grounded and say so when the documents don't cover the question.
 */
function groundedPrompt(question: string): string {
  return [
    'You are a retrieval assistant. Answer the question using ONLY the passages provided.',
    'Cite sources inline as (filename, p. N) after each claim.',
    'If the passages do not contain the answer, reply exactly: "The uploaded documents do not contain enough information to answer this."',
    'Do not use outside knowledge. Answer in the language of the question.',
    '',
    `Question: ${question}`,
  ].join('\n');
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(private readonly weaviate: WeaviateService) {}

  async search(dto: SearchDto): Promise<SearchResponse> {
    const started = Date.now();
    const chunks = this.weaviate.chunks();
    const common = {
      limit: dto.limit,
      returnProperties: RETURN_PROPS,
      returnMetadata: ['score', 'distance'] as ('score' | 'distance')[],
      filters: dto.documentId
        ? chunks.filter.byProperty('documentId').equal(dto.documentId)
        : undefined,
    };

    const res =
      dto.mode === 'keyword'
        ? await chunks.query.bm25(dto.query, common)
        : dto.mode === 'semantic'
          ? await chunks.query.nearText(dto.query, common)
          : await chunks.query.hybrid(dto.query, {
              ...common,
              alpha: dto.alpha,
              fusionType: 'RelativeScore',
            });

    return {
      query: dto.query,
      mode: dto.mode,
      passages: res.objects.map((o) => toPassage(o)),
      tookMs: Date.now() - started,
    };
  }

  /**
   * RAG: one Weaviate call does retrieval (hybrid/semantic/keyword) and hands
   * the passages to the generative-ollama module for a grounded answer.
   */
  async ask(dto: AskDto): Promise<AskResponse> {
    if (!dto.generate) {
      return { ...(await this.search(dto)), answer: null };
    }

    const started = Date.now();
    const chunks = this.weaviate.chunks();
    const generate = {
      groupedTask: groundedPrompt(dto.query),
      groupedProperties: ['text', 'filename', 'page'] as (keyof ChunkProps)[],
    };
    const common = {
      limit: dto.limit,
      returnProperties: RETURN_PROPS,
      returnMetadata: ['score', 'distance'] as ('score' | 'distance')[],
      filters: dto.documentId
        ? chunks.filter.byProperty('documentId').equal(dto.documentId)
        : undefined,
    };

    try {
      const res =
        dto.mode === 'keyword'
          ? await chunks.generate.bm25(dto.query, generate, common)
          : dto.mode === 'semantic'
            ? await chunks.generate.nearText(dto.query, generate, common)
            : await chunks.generate.hybrid(dto.query, generate, {
                ...common,
                alpha: dto.alpha,
                fusionType: 'RelativeScore',
              });

      const passages = res.objects.map((o) => toPassage(o));
      return {
        query: dto.query,
        mode: dto.mode,
        passages,
        answer:
          passages.length === 0
            ? 'No relevant passages were found in the uploaded documents.'
            : (res.generative?.text ?? res.generated ?? null),
        tookMs: Date.now() - started,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Generation failed: ${message}`);
      throw new ServiceUnavailableException(
        `Answer generation failed (is the Ollama model pulled? run "pnpm infra:pull-model"). ${message}`,
      );
    }
  }
}

function toPassage(o: {
  uuid: string;
  properties: Partial<ChunkProps>;
  metadata?: { score?: number; distance?: number };
}): Passage {
  const { score, distance } = o.metadata ?? {};
  return {
    id: o.uuid,
    documentId: o.properties.documentId ?? '',
    filename: o.properties.filename ?? '',
    page: o.properties.page ?? 1,
    chunkIndex: o.properties.chunkIndex ?? 0,
    text: o.properties.text ?? '',
    score:
      score !== undefined
        ? score
        : distance !== undefined
          ? 1 - distance
          : null,
  };
}
