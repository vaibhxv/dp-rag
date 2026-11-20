import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SEARCH_MODES, type SearchMode } from '../retrieval/search.dto.js';

/** One message as sent by the AI SDK `useChat` hook (UIMessage). */
export interface UIMessageLike {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: { type: string; text?: string }[];
}

/** Request body of the AI SDK chat transport plus our options. */
export class ChatDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsArray()
  @ArrayMaxSize(200)
  messages: UIMessageLike[];

  @IsOptional()
  @IsIn(SEARCH_MODES)
  mode?: SearchMode;

  /** Restrict retrieval to one document ("ask this document"). */
  @IsOptional()
  @IsUUID()
  documentId?: string;
}
