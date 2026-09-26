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
import { CacheService } from '../../../cache/cache.service';
import { Roles, SwaggerJwtAuth } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { VariantService } from './variant.service';
import { CreateVariantDto, UpdateVariantDto } from './dto';

@ApiTags('Admin — Варианты товаров')
@Controller('admin/products/:productId/variants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class VariantController {
  constructor(
    private readonly variantService: VariantService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Список вариантов товара',
    description: `**Доступ:** ADMIN

**Зачем:** просмотр всех вариантов (SKU) товара — размеры, цвета, цены, остатки, резервы.

**Что такое вариант:** конкретная комбинация товара для покупки. Например товар «Куртка зимова» может иметь варианты: L/Чорний, L/Синій, XL/Чорний — каждый со своим SKU, ценой и остатком.

**Ответ:** все варианты включая неактивные и soft-deleted, с данными size, color, stockQty, reservedQty.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Список вариантов товара.',
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
    return this.variantService.findAll(productId);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать вариант товара',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- \`sku\` должен быть уникальным глобально (артикул для складского учёта)
- \`sizeId\` обязателен для типов CLOTHING и SHOES, опционален для ACCESSORY
- Тип размера (\`sizeType\`) должен совпадать с \`productType\` товара (нельзя присвоить обувной размер одежде)
- \`colorId\` — цвет варианта (опционально)
- \`price\` — цена варианта (если отличается от basePrice товара)
- \`stockQty\` — количество на складе
- \`reservedQty\` — зарезервировано в неотправленных заказах (управляется автоматически при оформлении заказа)

**Доступный остаток:** \`availableQty = stockQty - reservedQty\`

**Побочные эффекты:** сброс кеша каталога и карточки товара`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Вариант создан, кеш сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации, дублирующий SKU или несовпадение sizeType с productType.',
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
    @Body() dto: CreateVariantDto,
  ) {
    const result = await this.variantService.create(productId, dto);
    await this.cacheService.invalidateProduct();
    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить вариант товара',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление — цена, остаток, активность, SKU. При изменении SKU проверяется уникальность. При изменении stockQty пересчитывается доступность на витрине.

**Влияние на витрину:** если \`availableQty\` падает до 0 — вариант пропадает из доступных. Если падает ниже \`lowStockThreshold\` из настроек — статус меняется на LOW_STOCK.

**Побочные эффекты:** сброс кеша каталога и карточки товара`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор варианта',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Вариант обновлён, кеш сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или дублирующий SKU.',
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
    description: 'Товар или вариант не найден.',
  })
  async update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVariantDto,
  ) {
    const result = await this.variantService.update(productId, id, dto);
    await this.cacheService.invalidateProduct();
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить вариант товара',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- **Soft delete** — проставляется \`deletedAt\`
- Вариант пропадает с витрины, но сохраняется в БД
- Заказы со снепшотами этого варианта не затрагиваются
- Если у товара не остаётся доступных вариантов — товар пропадает из каталога витрины

**Побочные эффекты:** сброс кеша каталога и карточки товара`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор варианта',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Вариант soft-deleted, кеш сброшен.',
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
    description: 'Товар или вариант не найден.',
  })
  async remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.variantService.remove(productId, id);
    await this.cacheService.invalidateProduct();
    return { message: 'Variant soft-deleted' };
  }
}
