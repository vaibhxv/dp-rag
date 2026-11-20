import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module.js';
import { HealthController } from './health/health.controller.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { RetrievalModule } from './retrieval/retrieval.module.js';
import { OllamaModule } from './ollama/ollama.module.js';
import { StoreModule } from './store/store.module.js';
import { WeaviateModule } from './weaviate/weaviate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StoreModule,
    WeaviateModule,
    OllamaModule,
    IngestionModule,
    RetrievalModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
