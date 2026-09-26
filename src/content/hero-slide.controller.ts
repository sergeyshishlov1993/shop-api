import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CacheService } from '../cache/cache.service';
import { ContentService } from './content.service';

@ApiTags('Storefront — Слайды главного экрана')
@Controller('storefront/hero-slides')
export class HeroSlideController {
  constructor(
    private readonly contentService: ContentService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Слайды главного экрана',
    description: `**Доступ:** публичный

**Зачем:** hero-баннер на главной странице — слайдер с акциями, новинками, сезонными коллекциями.

**Бизнес-логика:**
- Возвращаются только активные слайды (\`isActive: true\`)
- Сортировка по \`sortOrder\`
- Каждый слайд: title, subtitle, buttonText, buttonLink, imageUrl (десктоп + мобильная версия), overlayOpacity

**Кеш:** ключ \`homepage:hero-slides\`, TTL 120 сек. Сбрасывается при любом изменении слайдов в админке.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Массив активных слайдов.',
  })
  async getHeroSlides() {
    const cacheKey = 'homepage:hero-slides';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.contentService.getStorefrontHeroSlides();
    await this.cacheService.set(cacheKey, result, 120);
    return result;
  }
}
