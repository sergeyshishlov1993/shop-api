import {
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { FileService } from './file.service';

@ApiTags('Admin — Файли')
@Controller('admin/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Завантажити файл' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Файл завантажено.' })
  @ApiResponse({ status: 400, description: 'Непідтримуваний формат або перевищено розмір.' })
  @ApiResponse({ status: 401, description: 'Потрібна авторизація.' })
  @ApiResponse({ status: 403, description: 'Доступ тільки для ADMIN.' })
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.fileService.upload(file);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити файл' })
  @ApiParam({ name: 'id', description: 'ID файлу', example: 1 })
  @ApiResponse({ status: 200, description: 'Файл видалено.' })
  @ApiResponse({ status: 401, description: 'Потрібна авторизація.' })
  @ApiResponse({ status: 403, description: 'Доступ тільки для ADMIN.' })
  @ApiResponse({ status: 404, description: 'Файл не знайдено.' })
  deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.fileService.delete(id);
  }
}
