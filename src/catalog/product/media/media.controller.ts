import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { MediaService } from './media.service';
import { CreateInstagramMediaDto, CreateMediaDto, ReorderMediaDto, UpdateMediaDto } from './dto';

@ApiTags('Admin — Медиа товаров')
@Controller('admin/products/:productId/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOperation({
    summary: 'Медиа товара',
    description: `**Доступ:** ADMIN

**Зачем:** просмотр всех изображений и видео привязанных к товару.

**Ответ:** массив медиа с данными FileAsset (URL всех размеров), sortOrder, isMain, привязка к варианту (если есть).`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Список медиа товара.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден.',
  })
  async findAll(@Param('productId', ParseIntPipe) productId: number) {
    return this.mediaService.findAll(productId);
  }

  @Post()
  @ApiOperation({
    summary: 'Привязать медиа к товару',
    description: `**Доступ:** ADMIN

**Зачем:** привязка загруженного файла (из POST /admin/files/upload) к товару.

**Бизнес-логика:**
- \`fileId\` — id ранее загруженного FileAsset
- \`variantId\` — опционально, привязка медиа к конкретному варианту (например фото конкретного цвета)
- \`mediaType\` — IMAGE или VIDEO
- \`sortOrder\` — порядок отображения в галерее
- \`isMain\` — если \`true\`, сбрасывает \`isMain\` у остальных медиа товара (только одно основное фото, оно показывается в каталоге)`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Медиа привязано к товару.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или файл не найден.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден.',
  })
  async create(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateMediaDto,
  ) {
    return this.mediaService.create(productId, dto);
  }

  @Post('instagram')
  @ApiOperation({
    summary: 'Привязать Instagram-видео к товару',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** создаёт ProductMedia (VIDEO) без файла, с \`externalUrl\` — ссылкой на Instagram post/reel (instagram.com/(p|reel|reels|tv)/<code>).`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Instagram-медиа привязано к товару.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректная ссылка.',
  })
  async createInstagram(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateInstagramMediaDto,
  ) {
    return this.mediaService.createInstagram(productId, dto);
  }

  @Patch('reorder')
  @ApiOperation({
    summary: 'Изменить порядок медиа',
    description: `**Доступ:** ADMIN

**Зачем:** drag-and-drop сортировка галереи товара в админке.

**Тело:** массив \`[{ id, sortOrder }]\` — новый порядок для всех медиа товара.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Порядок медиа обновлён.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async reorder(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: ReorderMediaDto,
  ) {
    return this.mediaService.reorder(productId, dto);
  }

  @Patch(':id/main')
  @ApiOperation({
    summary: 'Сделать медиа основным',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** назначает медиа основным (\`isMain: true\`). У всех остальных медиа этого товара \`isMain\` сбрасывается. Основное медиа отображается как превью в каталоге и карточке товара.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор медиа',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Основное медиа обновлено.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар или медиа не найдено.',
  })
  async setMain(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mediaService.setMain(productId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить медиа товара',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление — sortOrder, variantId, isMain.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор медиа',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Медиа обновлено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар или медиа не найдено.',
  })
  async update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.mediaService.update(productId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить медиа товара',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** удаляет привязку медиа к товару (запись ProductMedia). Сам файл (FileAsset) НЕ удаляется — для этого используйте DELETE /admin/files/:id.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор медиа',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Привязка медиа удалена.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар или медиа не найдено.',
  })
  async remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.mediaService.remove(productId, id);
    return { message: 'Media deleted' };
  }
}
