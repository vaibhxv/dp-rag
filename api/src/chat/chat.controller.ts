import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatDto } from './chat.dto.js';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Streaming RAG chat (AI SDK UI message stream over SSE). */
  @Post()
  async chatStream(@Body() dto: ChatDto, @Res() res: Response) {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    await this.chat.stream(dto, res, abort.signal);
  }
}
