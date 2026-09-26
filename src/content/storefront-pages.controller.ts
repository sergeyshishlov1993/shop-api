import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PageSlugParamDto } from './dto/page-slug.param.dto';
import { PagesService } from './pages.service';

@ApiTags('Storefront — Страницы')
@Controller('storefront/pages')
export class StorefrontPagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get(':slug')
  @ApiOperation({
    summary: 'Статическая страница',
    description: `**Доступ:** публичный

**Зачем:** отображение статических страниц на витрине — «Про нас», «Доставка і оплата», «Обмін і повернення» и т.д.

**Бизнес-логика:**
- Возвращаются только страницы со статусом \`PUBLISHED\`
- Страница с \`status: DRAFT\` → 404

**Ответ:** title, content (HTML), metaTitle, metaDescription.`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug страницы',
    example: 'about',
  })
  @ApiResponse({
    status: 200,
    description: 'Опубликованная страница.',
  })
  @ApiResponse({
    status: 404,
    description: 'Страница не найдена или не опубликована.',
  })
  getPage(@Param() params: PageSlugParamDto) {
    return this.pagesService.getStorefrontPage(params.slug);
  }
}
