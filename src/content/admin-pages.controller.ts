import {
  Body,
  Controller,
  Get,
  Param,
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
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreatePageDto } from './dto/create-page.dto';
import { GetAdminPagesQueryDto } from './dto/get-admin-pages.query.dto';
import { PageSlugParamDto } from './dto/page-slug.param.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PagesService } from './pages.service';

@ApiTags('Admin — Страницы')
@Controller('admin/pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@SwaggerJwtAuth()
export class AdminPagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @ApiOperation({
    summary: 'Список страниц',
    description: `**Доступ:** ADMIN

**Зачем:** управление статическими страницами магазина — «Про нас», «Доставка і оплата», «Обмін і повернення», «Контакти» и т.д.

**Ответ:** все страницы (включая неопубликованные) с slug, title, status (DRAFT/PUBLISHED), createdAt, updatedAt.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список всех страниц.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  getPages(@Query() query: GetAdminPagesQueryDto) {
    return this.pagesService.getAdminPages(query);
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Страница по slug',
    description: `**Доступ:** ADMIN

**Ответ:** полные данные страницы включая HTML-контент, SEO мета-теги (metaTitle, metaDescription), статус публикации.`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug страницы (URL-friendly идентификатор)',
    example: 'about',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные страницы.',
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
    description: 'Страница не найдена.',
  })
  getPage(@Param() params: PageSlugParamDto) {
    return this.pagesService.getAdminPageBySlug(params.slug);
  }

  @Post(':slug')
  @ApiOperation({
    summary: 'Создать страницу',
    description: `**Доступ:** ADMIN

**Бизнес-логика:**
- \`slug\` берётся из URL параметра и должен быть уникальным
- Контент хранится как HTML (редактируется через WYSIWYG-редактор в админке)
- Создаётся со статусом DRAFT — не видна на витрине до публикации

**Поля:**
- \`title\` — заголовок страницы
- \`content\` — HTML-контент
- \`metaTitle\`, \`metaDescription\` — SEO мета-теги
- \`status\` — DRAFT или PUBLISHED`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug страницы',
    example: 'delivery-and-payment',
  })
  @ApiResponse({
    status: 201,
    description: 'Страница создана.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или slug уже занят.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  createPage(@Param() params: PageSlugParamDto, @Body() dto: CreatePageDto) {
    dto.slug = params.slug;
    return this.pagesService.createPage(dto);
  }

  @Patch(':slug')
  @ApiOperation({
    summary: 'Обновить страницу',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление — title, content, metaTitle, metaDescription, status. Для публикации — передать \`{ status: "PUBLISHED" }\`.`,
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug страницы',
    example: 'about',
  })
  @ApiResponse({
    status: 200,
    description: 'Страница обновлена.',
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
    description: 'Страница не найдена.',
  })
  updatePage(@Param() params: PageSlugParamDto, @Body() dto: UpdatePageDto) {
    return this.pagesService.updatePage(params.slug, dto);
  }
}
