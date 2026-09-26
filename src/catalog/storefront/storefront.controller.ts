import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { CacheService } from '../../cache/cache.service';
import { QueryStorefrontProductsDto } from './dto';
import { StorefrontService } from './storefront.service';

type StorefrontProductsResponse = Awaited<ReturnType<StorefrontService['findAll']>>;

@ApiTags('Storefront — Товары')
@Controller('storefront/products')
export class StorefrontController {
  constructor(
    private readonly storefrontService: StorefrontService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Каталог товаров',
    description: `**Доступ:** публичный

**Зачем:** главная страница каталога, страницы категорий, результаты поиска.

**Видимость товаров:** только active + not deleted + с ≥1 доступным вариантом (active, not deleted, availableQty > 0).

**Фильтры:**
- \`category\` — slug или id категории (если родительская → включает дочерние)
- \`productType\` — CLOTHING / SHOES / ACCESSORY
- \`size\`, \`color\` — id размера/цвета
- \`brand\`, \`season\`, \`material\` — строковые фильтры
- \`priceMin\`, \`priceMax\` — диапазон цен
- \`isNew\`, \`isHit\`, \`isSeasonal\` — флаги

**Поиск:** \`search\` — по name, slug, sku, brand (частичное совпадение)
**Сортировка:** \`sort\` — newest, price_asc, price_desc, name_asc
**Пагинация:** \`page\`, \`limit\`

**Ответ:**
- \`items[]\` — товары с main media, effectivePrice (min цена среди доступных вариантов), availabilityStatus (IN_STOCK / LOW_STOCK)
- \`totalCount\` — общее количество товаров по фильтрам
- \`filters\` — доступные значения фильтров с количеством: sizes[], colors[], brands[], seasons[], materials[], priceRange. Каждый фильтр считается исключая сам себя (чтобы не обнулялись варианты)

**Кеш:** ключи \`catalog:{hash}:{page}\` (60 сек) и \`filters:{hash}\` (60 сек). Сбрасывается при изменении товаров/вариантов/категорий.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Каталог с фильтрами и пагинацией.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные параметры запроса.',
  })
  async findAll(@Query() query: QueryStorefrontProductsDto) {
    const page = query.page ?? 1;
    const filtersHash = this.buildFiltersHash(query);
    const catalogCacheKey = `catalog:${filtersHash}:${page}`;
    const filtersCacheKey = `filters:${filtersHash}`;

    const [cachedItems, cachedFilters] = await Promise.all([
      this.cacheService.get<Omit<StorefrontProductsResponse, 'filters'>>(
        catalogCacheKey,
      ),
      this.cacheService.get<StorefrontProductsResponse['filters']>(
        filtersCacheKey,
      ),
    ]);

    if (cachedItems && cachedFilters) {
      return {
        ...cachedItems,
        filters: cachedFilters,
      };
    }

    const result = await this.storefrontService.findAll(query);
    const { filters, ...catalogData } = result;

    await Promise.all([
      this.cacheService.set(catalogCacheKey, catalogData, 60),
      this.cacheService.set(filtersCacheKey, filters, 60),
    ]);

    return result;
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Карточка товара',
    description: `**Доступ:** публичный

**Зачем:** страница товара на витрине.

**Ответ:**
- Все поля товара (name, description, brand, season, material, care и т.д.)
- Доступные варианты: size, color, price, availableQty, availabilityStatus
- Медиа: изображения и видео по sortOrder
- Категория с breadcrumb (parent → child → товар)
- SEO: metaTitle, metaDescription
- averageRating, reviewCount (из одобренных отзывов)

**Доступные варианты:** только active, not deleted, availableQty > 0. Недоступные варианты не показываются покупателю.

**Кеш:** ключ \`product:{slug}\`, TTL 120 сек. Сбрасывается при изменении товара или его вариантов.`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug товара (из URL)',
    example: 'kurtka-zymova-nike',
  })
  @ApiResponse({
    status: 200,
    description: 'Полные данные карточки товара.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден, неактивен или удалён.',
  })
  async findBySlug(@Param('slug') slug: string) {
    const cacheKey = `product:${slug}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.storefrontService.findBySlug(slug);
    await this.cacheService.set(cacheKey, result, 120);
    return result;
  }

  @Get(':slug/related')
  @ApiOperation({
    summary: 'Похожие товары и «с этим покупают»',
    description: `**Доступ:** публичный

**Зачем:** блоки рекомендаций на карточке товара для увеличения среднего чека.

**Ответ:**
- \`boughtTogether[]\` — товары, которые встречались в одних заказах с текущим. Сортировка по частоте совместных покупок, лимит 8
- \`similar[]\` — товары из той же категории/productType/brand, исключая текущий, лимит 8. Используется всегда как дополнительный блок

Оба блока: только active + not deleted + с доступными вариантами. Формат как ProductCard (main media, effectivePrice, availabilityStatus).

**Кеш:** ключ \`related:{slug}\`, TTL 120 сек. Сбрасывается при изменении товаров и при доставке заказов (новые данные о совместных покупках).`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug товара',
    example: 'kurtka-zymova-nike',
  })
  @ApiResponse({
    status: 200,
    description: '{ boughtTogether: ProductCard[], similar: ProductCard[] }',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден.',
  })
  async findRelated(@Param('slug') slug: string) {
    const cacheKey = `related:${slug}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.storefrontService.findRelated(slug);
    await this.cacheService.set(cacheKey, result, 120);
    return result;
  }

  private buildFiltersHash(query: QueryStorefrontProductsDto): string {
    const filtersQuery = Object.entries(query)
      .filter(([key, value]) => key !== 'page' && value !== undefined && value !== null)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('md5').update(filtersQuery).digest('hex');
  }
}
