import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CacheService } from '../../cache/cache.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { SwaggerJwtAuth } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@ApiTags('Admin — Категории')
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Дерево категорий',
    description: `**Доступ:** ADMIN

**Зачем:** управление структурой каталога. Категории двухуровневые: родительские (Одяг, Взуття, Аксесуари) и дочерние (Куртки, Кросівки, Сумки).

**Параметр:** \`includeDeleted\` — показать soft-deleted категории (для восстановления)

**Структура:** дерево — родительские категории содержат массив \`children\` с дочерними.`,
  })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    description: 'Включить удалённые категории',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'Дерево категорий получено.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.categoryService.findAll(includeDeleted === 'true');
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Категория по id',
    description: `**Доступ:** ADMIN

**Ответ:** полные данные категории включая связанные файлы (изображение, баннер), мета-теги для SEO, productType.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор категории',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Категория получена.',
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
    description: 'Категория не найдена.',
  })
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.findById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать категорию',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- \`slug\` должен быть уникальным (используется в URL витрины)
- \`parentId\` — если указан, создаётся дочерняя категория (только 2 уровня: parent → child)
- \`productType\` — тип товаров (\`CLOTHING\`, \`SHOES\`, \`ACCESSORY\`). Определяет какие размеры доступны для вариантов товаров этой категории
- \`imageFileId\`, \`bannerFileId\` — привязка загруженных файлов (из POST /admin/files/upload)

**Побочные эффекты:** сброс кеша категорий на витрине`,
  })
  @ApiResponse({
    status: 201,
    description: 'Категория создана, кеш витрины сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации, дублирующий slug или превышена вложенность.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async create(@Body() dto: CreateCategoryDto) {
    const result = await this.categoryService.create(dto);
    await this.cacheService.invalidateCategory();
    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить категорию',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление. При изменении slug проверяется уникальность. При изменении parentId проверяется что не превышается глубина вложенности (макс 2 уровня).

**Побочные эффекты:** сброс кеша категорий и каталога на витрине`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор категории',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Категория обновлена, кеш сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации, дублирующий slug или некорректный id.',
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
    description: 'Категория не найдена.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    const result = await this.categoryService.update(id, dto);
    await this.cacheService.invalidateCategory();
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить категорию',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- **Soft delete** — проставляется \`deletedAt\`, категория скрывается с витрины но сохраняется в БД
- Перед удалением проверяется что в категории нет активных товаров (не удалённых). Если есть — ошибка 400
- Для восстановления — обновить через PATCH (убрать deletedAt)

**Побочные эффекты:** сброс кеша категорий и каталога`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор категории',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Категория soft-deleted, кеш сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'В категории есть активные товары — удаление невозможно.',
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
    description: 'Категория не найдена.',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.categoryService.remove(id);
    await this.cacheService.invalidateCategory();
    return { message: 'Category deleted' };
  }
}
