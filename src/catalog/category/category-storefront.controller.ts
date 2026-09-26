import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CacheService } from '../../cache/cache.service';
import { CategoryService } from './category.service';

@ApiTags('Storefront — Категории')
@Controller('storefront/categories')
export class CategoryStorefrontController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Дерево активных категорий',
    description: `**Доступ:** публичный

**Зачем:** отображение меню категорий на витрине, навигация по каталогу, хлебные крошки.

**Бизнес-логика:**
- Возвращаются только активные (\`isActive: true\`) и не удалённые (\`deletedAt IS NULL\`) категории
- Структура — дерево: родительские категории с массивом \`children\`
- Сортировка по \`sortOrder\`
- Каждая категория содержит: id, name, slug, productType, imageUrl, bannerUrl

**Кеш:** ключ \`categories\`, TTL 300 сек (5 мин). Сбрасывается при любом изменении категорий в админке.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Дерево категорий витрины.',
  })
  async findAll() {
    const cacheKey = 'categories';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.categoryService.findAllStorefront();
    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }
}
