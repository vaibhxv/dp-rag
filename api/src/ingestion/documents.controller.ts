import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IngestionService } from './ingestion.service.js';

const MAX_FILES = 10;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly ingestion: IngestionService) {}

  /**
   * multipart/form-data with one or more `files` fields.
   * Each file is processed independently so one bad file doesn't fail the rest.
   */
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[] | undefined) {
    if (!files?.length) {
      throw new BadRequestException('Attach at least one file as "files"');
    }

    const results = [];
    for (const file of files) {
      try {
        results.push({ ok: true, document: await this.ingestion.ingest(file) });
      } catch (err) {
        results.push({
          ok: false,
          filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          error: (err as Error).message,
        });
      }
    }
    return { results };
  }

  @Get()
  list() {
    return this.ingestion.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.ingestion.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.ingestion.remove(id);
  }
}
