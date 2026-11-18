import { Controller, Get } from '@nestjs/common';
import { WeaviateService } from '../weaviate/weaviate.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly weaviate: WeaviateService) {}

  @Get()
  async health() {
    const weaviateReady = await this.weaviate.isReady();
    return {
      status: weaviateReady ? 'ok' : 'degraded',
      weaviate: weaviateReady,
    };
  }
}
