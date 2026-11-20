import { Controller, Get } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service.js';
import { StoreService } from '../store/store.service.js';
import { WeaviateService } from '../weaviate/weaviate.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly weaviate: WeaviateService,
    private readonly ollama: OllamaService,
    private readonly store: StoreService,
  ) {}

  @Get()
  async health() {
    const [weaviateReady, ollamaReady] = await Promise.all([
      this.weaviate.isReady(),
      fetch(`${this.ollama.endpoint}/api/version`, {
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => r.ok)
        .catch(() => false),
    ]);
    return {
      status: weaviateReady && ollamaReady ? 'ok' : 'degraded',
      weaviate: weaviateReady,
      ollama: ollamaReady,
      model: this.ollama.model,
      stats: this.store.stats(),
    };
  }
}
