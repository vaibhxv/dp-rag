import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { RetrievalModule } from './retrieval/retrieval.module.js';
import { WeaviateModule } from './weaviate/weaviate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WeaviateModule,
    IngestionModule,
    RetrievalModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
