import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  DuplicateDocumentError,
  IngestionService,
} from './ingestion.service.js';

const MAX_FILES = 50;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly ingestion: IngestionService) {}

  /**
   * multipart/form-data with one or more `files` fields. Each file is stored
   * and queued independently (status "queued"); poll GET /documents for
   * progress. One bad file doesn't fail the rest.
   */
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[] | undefined) {
    if (!files?.length) {
      throw new BadRequestException('Attach at least one file as "files"');
    }
    return {
      results: files.map((file) => {
        try {
          return { ok: true, document: this.ingestion.accept(file) };
        } catch (err) {
          return {
            ok: false,
            filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
            error: (err as Error).message,
            duplicateOf:
              err instanceof DuplicateDocumentError
                ? {
                    id: err.existing.id,
                    title: err.existing.title,
                    filename: err.existing.filename,
                  }
                : undefined,
          };
        }
      }),
    };
  }

  @Get()
  list() {
    return this.ingestion.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.ingestion.get(id);
  }

  /** Extracted text per page (text layer or OCR). */
  @Get(':id/pages')
  pages(@Param('id', ParseUUIDPipe) id: string) {
    return this.ingestion.pages(id);
  }

  /** The original uploaded file, served inline (PDFs open in the browser viewer). */
  @Get(':id/file')
  file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { doc, data } = this.ingestion.file(id);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Length', data.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(data);
  }

  /** Page-1 thumbnail (PNG) for library cards; 404 for non-PDF files. */
  @Get(':id/thumbnail')
  async thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const png = await this.ingestion.thumbnail(id);
    if (!png) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(png);
  }

  /** Regenerates title, summary, category and suggested questions. */
  @Post(':id/describe')
  @HttpCode(200)
  describe(@Param('id', ParseUUIDPipe) id: string) {
    return this.ingestion.redescribe(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.ingestion.remove(id);
  }
}
