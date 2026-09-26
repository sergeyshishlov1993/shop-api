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
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CacheService } from '../../../cache/cache.service';
import { Roles, SwaggerJwtAuth } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CreatePromoBlockLinkProductDto } from '../../dto/create-promo-block-link-product.dto';
import { CreatePromoBlockDto } from '../../dto/create-promo-block.dto';
import { DeletePromoBlockLinkProductDto } from '../../dto/delete-promo-block-link-product.dto';
import { GetAdminPromoBlocksQueryDto } from '../../dto/get-admin-promo-blocks-query.dto';
import { UpdatePromoBlockDto } from '../../dto/update-promo-block.dto';
import { AdminPromoBlocksService } from '../../services/promo-blocks/admin-promo-blocks.service';

@ApiTags('Admin — Промо-блоки')
@Controller('admin/promo-blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class AdminPromoBlocksController {
  constructor(
    private readonly adminPromoBlocksService: AdminPromoBlocksService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Список промо-блоков',
    description: `**Доступ:** ADMIN

**Зачем:** управление промо-блоками — просмотр всех включая неактивные.

**Отличие от витрины:** показывает ВСЕ блоки (включая \`isActive: false\`), количество привязанных товаров, даты создания/обновления.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Все промо-блоки.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  getPromoBlocks(@Query() query: GetAdminPromoBlocksQueryDto) {
    return this.adminPromoBlocksService.getPromoBlocks(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать промо-блок',
    description: `**Доступ:** ADMIN

**Поля:**
- \`title\` — заголовок блока («Новинки», «Хіти продажів»)
- \`type\` — NEW, HIT, SEASONAL, CUSTOM
- \`sortOrder\` — порядок отображения на странице
- \`isActive\` — показывать на витрине
- \`imageFileId\` — опционально, фоновое изображение блока

**Для типов NEW/HIT/SEASONAL:** товары подтягиваются автоматически по соответствующему флагу.
**Для CUSTOM:** товары привязываются вручную через POST :id/products.

**Побочные эффекты:** сброс кеша промо-блоков`,
  })
  @ApiResponse({
    status: 201,
    description: 'Промо-блок создан, кеш сброшен.',
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
  async createPromoBlock(@Body() dto: CreatePromoBlockDto) {
    const result = await this.adminPromoBlocksService.createPromoBlock(dto);
    await this.cacheService.invalidatePromoBlocks();
    return result;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить промо-блок',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление — title, sortOrder, isActive, imageFileId. Тип (\`type\`) изменить нельзя — это определяет логику наполнения.

**Побочные эффекты:** сброс кеша промо-блоков`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор промо-блока',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Промо-блок обновлён, кеш сброшен.',
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
    description: 'Промо-блок не найден.',
  })
  async updatePromoBlock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromoBlockDto,
  ) {
    const result = await this.adminPromoBlocksService.updatePromoBlock(id, dto);
    await this.cacheService.invalidatePromoBlocks();
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить промо-блок',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** физическое удаление промо-блока и всех связей PromoBlockProduct. Файлы (FileAsset) НЕ удаляются.

**Побочные эффекты:** сброс кеша промо-блоков`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор промо-блока',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Промо-блок удалён, кеш сброшен.',
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
    description: 'Промо-блок не найден.',
  })
  async deletePromoBlock(@Param('id', ParseIntPipe) id: number) {
    const result = await this.adminPromoBlocksService.deletePromoBlock(id);
    await this.cacheService.invalidatePromoBlocks();
    return result;
  }

  @Post(':id/products')
  @ApiOperation({
    summary: 'Привязать товар к промо-блоку',
    description: `**Доступ:** ADMIN

**Зачем:** наполнение CUSTOM промо-блоков вручную. Для NEW/HIT/SEASONAL — товары подтягиваются автоматически, но можно дополнительно привязать вручную.

**Бизнес-логика:**
- Проверяется что товар существует и активен
- Создаётся запись PromoBlockProduct (promoBlockId + productId, composite unique)
- Если уже привязан — ошибка 400

**Побочные эффекты:** сброс кеша промо-блоков`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор промо-блока',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Товар привязан к промо-блоку, кеш сброшен.',
  })
  @ApiResponse({
    status: 400,
    description: 'Товар уже привязан или ошибка валидации.',
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
    description: 'Промо-блок или товар не найден.',
  })
  async addProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePromoBlockLinkProductDto,
  ) {
    const result = await this.adminPromoBlocksService.addProduct(id, dto);
    await this.cacheService.invalidatePromoBlocks();
    return result;
  }

  @Delete(':id/products')
  @ApiOperation({
    summary: 'Отвязать товар от промо-блока',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** удаляет запись PromoBlockProduct. Сам товар не затрагивается.

**Побочные эффекты:** сброс кеша промо-блоков`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор промо-блока',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Товар отвязан от промо-блока, кеш сброшен.',
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
    description: 'Промо-блок или связь не найдена.',
  })
  async removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeletePromoBlockLinkProductDto,
  ) {
    const result = await this.adminPromoBlocksService.removeProduct(id, dto);
    await this.cacheService.invalidatePromoBlocks();
    return result;
  }
}
