import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { type ChatMessage, OllamaService } from '../ollama/ollama.service.js';
import { RerankerService } from '../retrieval/reranker.service.js';
import {
  type Passage,
  RetrievalService,
} from '../retrieval/retrieval.service.js';
import type { ChatDto, UIMessageLike } from './chat.dto.js';

/** 3 measured better than 5 with a 1.5B model: fewer look-alike lines to confuse. */
const PASSAGE_LIMIT = Number(process.env.CHAT_PASSAGES ?? 3);
/** Hybrid-search candidates handed to the reranker (when one is configured). */
const RERANK_CANDIDATES = Number(process.env.RERANK_CANDIDATES ?? 20);
/**
 * With a reranker, its top score (0-1) is the relevance gate instead of the
 * embedding similarity: a cross-encoder separates "answers the question" from
 * "same topic" far more sharply. Calibrated on the sample documents.
 */
const MIN_RERANK_SCORE = Number(process.env.MIN_RERANK_SCORE ?? 0.1);
/**
 * Below this cosine similarity (best passage vs the question) the question is
 * treated as not covered and the LLM is not called. Measured on the 25 sample
 * documents: in-scope questions scored 0.54-0.75, clearly off-topic ones
 * 0.21-0.49. Near-domain questions (e.g. "punishment for murder", 0.54) can
 * still pass, and the prompt then has to handle them.
 */
const MIN_RELEVANCE = Number(process.env.MIN_RELEVANCE ?? 0.5);
const NOT_COVERED = 'The uploaded documents do not cover this.';
/** Previous turns sent to the LLM for follow-up questions. */
const HISTORY_TURNS = 4;

const SYSTEM_PROMPT = [
  'You are a careful assistant that answers questions using ONLY the numbered document passages provided.',
  'Rules:',
  '- Quote exact figures, names, designations, dates and section numbers from the passages.',
  '- After each fact, cite its passage number in square brackets, like [1] or [2].',
  '- Answer in 1-4 short sentences, in the same language as the question.',
  `- Do not use outside knowledge. If the passages do not answer the question, say exactly: "${NOT_COVERED}" and nothing else.`,
].join('\n');

function textOf(m: UIMessageLike): string {
  return (m.parts ?? [])
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

function contextBlock(passages: Passage[]): string {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] ${p.title || p.filename} (${p.filename}, page ${p.page})\n${p.text}`,
    )
    .join('\n\n');
}

/**
 * Streaming RAG chat in the AI SDK "UI message stream" protocol (SSE), so the
 * UI can use `useChat` from @ai-sdk/react directly.
 *
 *   retrieval (Weaviate hybrid) -> `data-sources` part -> answer tokens from
 *   the local LLM (Ollama) as `text-delta` parts -> `data-meta` part.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly ollama: OllamaService,
    private readonly reranker: RerankerService,
  ) {}

  /**
   * Finds the passages to answer from, plus a relevance score for the
   * "not covered" gate. With a reranker: hybrid search for candidates, then
   * cross-encoder reranking. Without: hybrid top-N, gated by the best
   * embedding similarity.
   */
  private async findPassages(query: string, dto: ChatDto) {
    const mode = dto.mode ?? 'hybrid';
    if (this.reranker.enabled) {
      const { passages: candidates } = await this.retrieval.search({
        query,
        mode,
        alpha: 0.5,
        limit: RERANK_CANDIDATES,
        documentId: dto.documentId,
      });
      try {
        const hits = await this.reranker.rerank(
          query,
          candidates.map((p) => `${p.title}\n${p.text}`),
        );
        const passages = hits
          .slice(0, PASSAGE_LIMIT)
          .map((h) => ({ ...candidates[h.index], score: h.score }));
        const relevance = hits[0]?.score ?? 0;
        return { passages, mode, relevance, covered: relevance >= MIN_RERANK_SCORE };
      } catch (err) {
        this.logger.warn(`Reranker unavailable, using hybrid order: ${(err as Error).message}`);
      }
    }
    const [{ passages }, best] = await Promise.all([
      this.retrieval.search({
        query,
        mode,
        alpha: 0.5,
        limit: PASSAGE_LIMIT,
        documentId: dto.documentId,
      }),
      // Hybrid scores are relative, so measure absolute relevance separately.
      this.retrieval.search({
        query,
        mode: 'semantic',
        alpha: 0.5,
        limit: 1,
        documentId: dto.documentId,
      }),
    ]);
    const relevance = best.passages[0]?.score ?? 0;
    return {
      passages,
      mode,
      relevance,
      covered: passages.length > 0 && relevance >= MIN_RELEVANCE,
    };
  }

  async stream(dto: ChatDto, res: Response, signal: AbortSignal) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
    res.flushHeaders();
    const send = (chunk: object) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);

    const started = Date.now();
    const messages = dto.messages.filter((m) => m.role !== 'system');
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const question = last ? textOf(last) : '';
    const textId = 'answer';

    try {
      send({ type: 'start' });
      if (!question) throw new Error('Empty question');

      // Short follow-ups ("and for a constable?") need the previous question
      // to retrieve the right passages.
      const previousUser = messages
        .filter((m) => m.role === 'user' && m !== last)
        .map(textOf)
        .at(-1);
      const query =
        previousUser && question.split(/\s+/).length < 7
          ? `${previousUser} ${question}`
          : question;

      send({
        type: 'data-status',
        data: { step: 'retrieving' },
        transient: true,
      });
      const { passages, mode, relevance, covered } = await this.findPassages(query, dto);
      send({
        type: 'data-sources',
        id: 'sources',
        data: { passages, mode, relevance, covered },
      });

      send({ type: 'text-start', id: textId });
      if (!covered) {
        send({ type: 'text-delta', id: textId, delta: NOT_COVERED });
      } else {
        send({
          type: 'data-status',
          data: { step: 'generating' },
          transient: true,
        });
        const history: ChatMessage[] = messages
          .slice(0, -1)
          .slice(-HISTORY_TURNS)
          .map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: textOf(m),
          }));
        const prompt: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          {
            role: 'user',
            content: `Document passages:\n\n${contextBlock(passages)}\n\nQuestion: ${question}\n\nAnswer from the passages and end each sentence with the passage number in brackets, e.g. [1].`,
          },
        ];
        for await (const delta of this.ollama.stream(prompt, {
          temperature: 0,
          numCtx: 4096,
          signal,
        })) {
          send({ type: 'text-delta', id: textId, delta });
        }
      }
      send({ type: 'text-end', id: textId });
      send({
        type: 'data-meta',
        id: 'meta',
        data: { tookMs: Date.now() - started, model: this.ollama.model, mode },
      });
      send({ type: 'finish' });
    } catch (err) {
      if (!signal.aborted) {
        const message = (err as Error).message;
        this.logger.error(`Chat failed: ${message}`);
        send({
          type: 'error',
          errorText: `Could not answer: ${message}. Is Ollama running?`,
        });
      }
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
