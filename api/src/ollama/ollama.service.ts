import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  /** Context window. Kept modest: an 8 GB laptop runs this. */
  numCtx?: number;
  /** Ollama structured output (JSON schema). */
  format?: unknown;
  signal?: AbortSignal;
}

/**
 * Thin client for the local Ollama server, used directly by the API for
 * (a) streaming chat answers token by token and (b) describing documents at
 * ingestion. Embeddings still go through Weaviate's text2vec-ollama.
 */
@Injectable()
export class OllamaService {
  readonly endpoint: string;
  readonly model: string;

  constructor(config: ConfigService) {
    // OLLAMA_ENDPOINT is what Weaviate uses; the API may need a different
    // address when Weaviate runs in Docker (http://ollama:11434 vs localhost).
    this.endpoint =
      config.get<string>('OLLAMA_API_ENDPOINT') ??
      config.get<string>('OLLAMA_ENDPOINT', 'http://localhost:11434');
    this.model = config.get<string>('OLLAMA_MODEL', 'qwen2.5:1.5b');
  }

  private async post(messages: ChatMessage[], stream: boolean, o: ChatOptions) {
    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: o.signal,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream,
        format: o.format,
        keep_alive: '30m',
        options: { temperature: o.temperature ?? 0, num_ctx: o.numCtx ?? 4096 },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  async complete(messages: ChatMessage[], o: ChatOptions = {}): Promise<string> {
    const res = await this.post(messages, false, o);
    const body = (await res.json()) as { message?: { content?: string } };
    return body.message?.content ?? '';
  }

  /** Yields content deltas as Ollama produces them (NDJSON stream). */
  async *stream(
    messages: ChatMessage[],
    o: ChatOptions = {},
  ): AsyncGenerator<string> {
    const res = await this.post(messages, true, o);
    if (!res.body) return;
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const chunk = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
          done?: boolean;
        };
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.message?.content) yield chunk.message.content;
        if (chunk.done) return;
      }
    }
  }
}
