import { Module } from '@nestjs/common';
import { RetrievalController } from './retrieval.controller.js';
import { RerankerService } from './reranker.service.js';
import { RetrievalService } from './retrieval.service.js';

@Module({
  controllers: [RetrievalController],
  providers: [RetrievalService, RerankerService],
  exports: [RetrievalService, RerankerService],
})
export class RetrievalModule {}
