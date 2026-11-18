import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SEARCH_MODES = ['hybrid', 'semantic', 'keyword'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export class SearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  query: string;

  /** hybrid = BM25 + vector (default), semantic = vector only, keyword = BM25 only. */
  @IsOptional()
  @IsIn(SEARCH_MODES)
  mode: SearchMode = 'hybrid';

  /** Hybrid weighting: 0 = pure keyword, 1 = pure vector. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  alpha = 0.5;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 8;

  /** Restrict search to a single document. */
  @IsOptional()
  @IsUUID()
  documentId?: string;
}

export class AskDto extends SearchDto {
  /** When false, only the retrieved passages are returned (no LLM call). */
  @IsOptional()
  @IsBoolean()
  generate = true;
}
