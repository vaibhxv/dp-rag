import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RerankHit {
  index: number;
  /** Relevance 0-1 (sigmoid of the cross-encoder logit). */
  score: number;
}

/**
 * Cross-encoder reranker served by Hugging Face text-embeddings-inference
 * (`bge-reranker-v2-m3`, see docker-compose.yml). Hybrid search finds ~20
 * candidates; the reranker reads question + passage together and scores how
 * well each passage answers it. Much better than vector similarity at telling
 * look-alike lines apart ("Sub-Inspector" vs "Assistant Sub-Inspector").
 *
 * Optional: without RERANKER_URL the hybrid ranking is used as before.
 */
@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  readonly url?: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('RERANKER_URL') || undefined;
    if (this.url) this.logger.log(`Reranking with ${this.url}`);
  }

  get enabled(): boolean {
    return Boolean(this.url);
  }

  /** Returns hits sorted by descending relevance. */
  async rerank(query: string, texts: string[]): Promise<RerankHit[]> {
    if (!this.url || texts.length === 0) return [];
    const res = await fetch(`${this.url}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ query, texts, truncate: true }),
    });
    if (!res.ok) throw new Error(`Reranker ${res.status}: ${await res.text()}`);
    const hits = (await res.json()) as RerankHit[];
    return hits.sort((a, b) => b.score - a.score);
  }

  async isReady(): Promise<boolean> {
    if (!this.url) return false;
    try {
      return (await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  }
}
