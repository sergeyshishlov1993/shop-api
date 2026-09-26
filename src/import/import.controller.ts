import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SwaggerAdminAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { ImportService } from './import.service';

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
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Превью CSV/XLSX: заголовки + первые строки' })
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(file.buffer, file.originalname);
  }

  @Post('stock')
  @UseInterceptors(FileInterceptor('file'))
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

  @Post('yml')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Импорт товаров из YML (Rozetka/Prom): создание и обновление по SKU' })
  runYml(@UploadedFile() file: Express.Multer.File) {
    return this.importService.runYml(file.buffer);
  }
}
