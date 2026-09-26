import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CacheService } from '../../../cache/cache.service';
import { GetStorefrontPromoBlocksQueryDto } from '../../dto/get-storefront-promo-blocks-query.dto';
import { StorefrontPromoBlocksService } from '../../services/promo-blocks/storefront-promo-blocks.service';

@ApiTags('Storefront — Промо-блоки')
@Controller('storefront/promo-blocks')
export class StorefrontPromoBlocksController {
  constructor(
    private readonly storefrontPromoBlocksService: StorefrontPromoBlocksService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Промо-блоки витрины',
    description: `**Доступ:** публичный

**Зачем:** секции на главной странице и страницах каталога — «Новинки», «Хіти продажів», «Сезонна колекція», кастомные подборки.

**Типы промо-блоков:**
- \`NEW\` — товары с флагом \`isNew: true\`
- \`HIT\` — товары с флагом \`isHit: true\`
- \`SEASONAL\` — товары с флагом \`isSeasonal: true\`
- \`CUSTOM\` — ручная подборка товаров (привязываются через admin POST :id/products)

**Фильтр:** \`type\` — получить блоки конкретного типа. Без фильтра — все активные.

**Бизнес-логика:**
- Возвращаются только активные блоки (\`isActive: true\`)
- Сортировка по \`sortOrder\`
- Товары в каждом блоке: только active + not deleted + с доступными вариантами
- Формат товаров: ProductCard (main media, effectivePrice, availabilityStatus)

**Кеш:** ключ \`homepage:promo-blocks:{type|all}\`, TTL 120 сек. Сбрасывается при изменении промо-блоков или привязанных товаров.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Массив промо-блоков с товарами.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректный параметр type.',
  })
  async getPromoBlocks(@Query() query: GetStorefrontPromoBlocksQueryDto) {
    const cacheKey = `homepage:promo-blocks:${query.type ?? 'all'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.storefrontPromoBlocksService.getPromoBlocks(query);
    await this.cacheService.set(cacheKey, result, 120);
    return result;
  }
}
