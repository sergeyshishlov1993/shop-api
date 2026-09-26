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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CacheService } from '../../cache/cache.service';
import { Roles, SwaggerJwtAuth } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProductService } from './product.service';
import { CreateProductDto, QueryProductDto, UpdateProductDto } from './dto';

@ApiTags('Admin — Товары')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Список товаров',
    description: `**Доступ:** ADMIN

**Зачем:** управление каталогом — просмотр, поиск, фильтрация всех товаров включая неактивные и удалённые.

**Фильтры:** \`categoryId\`, \`productType\`, \`brand\`, \`isActive\`, \`isNew\`, \`isHit\`, \`isSeasonal\`
**Поиск:** по \`name\`, \`slug\`, \`sku\` (частичное совпадение)
**Сортировка:** \`createdAt\`, \`name\`, \`basePrice\` (asc/desc)
**Пагинация:** \`page\`, \`limit\`

**Отличие от витрины:** показывает ВСЕ товары — неактивные, удалённые, без вариантов.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список товаров с пагинацией.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные параметры запроса.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async findAll(@Query() query: QueryProductDto) {
    return this.productService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Товар по id',
    description: `**Доступ:** ADMIN

**Ответ:** полные данные товара включая:
- Все варианты (включая неактивные и удалённые) с размером, цветом, ценой, остатками
- Все медиа (изображения, видео) с URL и сортировкой
- Категория с breadcrumb
- SEO мета-теги
- Финансовые поля (purchaseCost, маржа)`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Товар с вариантами и медиа.',
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
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать товар',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- \`slug\` должен быть уникальным (используется в URL: /products/{slug})
- \`categoryId\` — категория должна существовать и быть активной
- \`productType\` должен совпадать с \`productType\` категории (CLOTHING товар в CLOTHING категории)
- \`basePrice\` — основная цена, \`oldPrice\` — зачёркнутая цена (для отображения скидки)
- \`purchaseCost\` — себестоимость (для расчёта маржи и прибыли в отчётах)
- Флаги \`isNew\`, \`isHit\`, \`isSeasonal\` — для промо-блоков и фильтров на витрине

**Побочные эффекты:** сброс кеша каталога`,
  })
  @ApiResponse({
    status: 201,
    description: 'Товар создан, кеш каталога сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации, дублирующий slug, несуществующая категория или несовпадение productType.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async create(@Body() dto: CreateProductDto) {
    const result = await this.productService.create(dto);
    await this.cacheService.invalidateProduct();
    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить товар',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление. При изменении slug проверяется уникальность. При изменении categoryId проверяется совместимость productType.

**Побочные эффекты:** сброс кеша каталога и карточки товара (по slug)`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Товар обновлён, кеш сброшен.',
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
    description: 'Товар не найден.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    const result = await this.productService.update(id, dto);
    await this.cacheService.invalidateProduct(result.slug);
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить товар',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- **Soft delete** — проставляется \`deletedAt\`, товар скрывается с витрины но сохраняется в БД
- Все варианты товара также помечаются как удалённые
- Товар пропадает из каталога, поиска, фильтров, промо-блоков
- Заказы со снепшотами этого товара сохраняются без изменений

**Побочные эффекты:** сброс кеша каталога`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Товар soft-deleted, кеш сброшен.',
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
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.productService.remove(id);
    await this.cacheService.invalidateProduct();
    return { message: 'Product soft-deleted' };
  }
}
