import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RetrievalService } from './retrieval.service.js';
import { AskDto, SearchDto } from './search.dto.js';

@Controller()
export class RetrievalController {
  constructor(private readonly retrieval: RetrievalService) {}

  /** Retrieval only: returns ranked source passages, no LLM involved. */
  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchDto) {
    return this.retrieval.search(dto);
  }

  /** RAG: retrieval + grounded answer generated from the retrieved passages. */
  @Post('ask')
  @HttpCode(200)
  ask(@Body() dto: AskDto) {
    return this.retrieval.ask(dto);
  }
}
