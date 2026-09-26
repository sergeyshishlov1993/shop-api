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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CacheService } from '../cache/cache.service';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { ContentService } from './content.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@ApiTags('Admin — Слайды главного экрана')
@Controller('admin/hero-slides')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class AdminHeroSlideController {
  constructor(
    private readonly contentService: ContentService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Список всех слайдов',
    description: `**Доступ:** ADMIN

**Зачем:** управление hero-баннером — просмотр всех слайдов включая неактивные.

**Отличие от витрины:** показывает ВСЕ слайды (включая \`isActive: false\`) с полными данными для редактирования.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Все слайды включая неактивные.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  getHeroSlides() {
    return this.contentService.getAdminHeroSlides();
  }

  @Post()
  @ApiOperation({
    summary: 'Создать слайд',
    description: `**Доступ:** ADMIN

**Поля:**
- \`title\`, \`subtitle\` — текст на слайде
- \`buttonText\`, \`buttonLink\` — CTA кнопка (например «Перейти в каталог» → /catalog/new)
- \`desktopImageFileId\`, \`mobileImageFileId\` — id загруженных файлов (из POST /admin/files/upload)
- \`overlayOpacity\` — затемнение фона под текстом (0–1)
- \`sortOrder\` — порядок в слайдере
- \`isActive\` — показывать на витрине

**Побочные эффекты:** сброс кеша hero-slides`,
  })
  @ApiResponse({
    status: 201,
    description: 'Слайд создан, кеш сброшен.',
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
  async createHeroSlide(@Body() dto: CreateHeroSlideDto) {
    const result = await this.contentService.createHeroSlide(dto);
    await this.cacheService.invalidateHeroSlides();
    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить слайд',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление любых полей. Для быстрого включения/выключения — передать только \`{ isActive: false }\`.

**Побочные эффекты:** сброс кеша hero-slides`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор слайда',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Слайд обновлён, кеш сброшен.',
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
    description: 'Слайд не найден.',
  })
  async updateHeroSlide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHeroSlideDto,
  ) {
    const result = await this.contentService.updateHeroSlide(id, dto);
    await this.cacheService.invalidateHeroSlides();
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить слайд',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** физическое удаление слайда. Файлы (FileAsset) НЕ удаляются автоматически — для очистки использовать DELETE /admin/files/:id.

**Побочные эффекты:** сброс кеша hero-slides`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор слайда',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Слайд удалён, кеш сброшен.',
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
    description: 'Слайд не найден.',
  })
  async deleteHeroSlide(@Param('id', ParseIntPipe) id: number) {
    const result = await this.contentService.deleteHeroSlide(id);
    await this.cacheService.invalidateHeroSlides();
    return result;
  }
}
