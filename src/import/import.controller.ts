import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SwaggerAdminAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { ImportService, PRODUCT_FIELDS, ProductMapping } from './import.service';

function toIndex(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

@ApiTags('Admin — Импорт')
@Controller('admin/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerAdminAuth()
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Превью CSV/XLSX: заголовки + первые строки' })
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(file.buffer, file.originalname);
  }

  @Post('stock')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Импорт остатков/цен по SKU из CSV/XLSX' })
  runStock(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { sku?: string; price?: string; stockQty?: string },
  ) {
    return this.importService.runStock(file.buffer, {
      sku: toIndex(body.sku) as number,
      price: toIndex(body.price),
      stockQty: toIndex(body.stockQty),
    }, file.originalname);
  }

  @Post('products')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Импорт товаров из CSV/XLSX (Google Sheets, 1С): создание и обновление по SKU' })
  runProducts(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Partial<Record<(typeof PRODUCT_FIELDS)[number], string>>,
  ) {
    const mapping: ProductMapping = {};
    for (const key of PRODUCT_FIELDS) mapping[key] = toIndex(body[key]);
    return this.importService.runProducts(file.buffer, mapping, file.originalname);
  }

  @Post('photos')
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Фото пачкой: имя файла = SKU варианта (ABC-1.jpg, ABC-1_2.jpg)' })
  importPhotos(@UploadedFiles() files: Express.Multer.File[]) {
    return this.importService.importPhotos(files ?? []);
  }

  @Post('yml')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Импорт товаров из YML (Rozetka/Prom): создание и обновление по SKU' })
  runYml(@UploadedFile() file: Express.Multer.File) {
    return this.importService.runYml(file.buffer);
  }
}
