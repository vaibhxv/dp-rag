import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [IngestionService],
})
export class IngestionModule {}
