import { Global, Module } from '@nestjs/common';
import { WeaviateService } from './weaviate.service.js';

@Global()
@Module({
  providers: [WeaviateService],
  exports: [WeaviateService],
})
export class WeaviateModule {}
