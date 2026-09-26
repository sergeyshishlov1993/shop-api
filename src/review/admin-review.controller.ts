import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AdminReplyReviewDto,
  AdminReviewQueryDto,
  UpdateReviewStatusDto,
} from './dto';
import { ReviewService } from './review.service';

@ApiTags('Admin — Отзывы')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class AdminReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @ApiOperation({
    summary: 'Список отзывов',
    description: `**Доступ:** ADMIN

**Зачем:** модерация отзывов — просмотр новых, одобрение, отклонение.

**Фильтры:**
- \`status\` — PENDING (новые, ждут модерации), APPROVED, REJECTED
- \`productId\` — отзывы конкретного товара

**Ответ:** все отзывы (включая PENDING и REJECTED) с данными пользователя, товара, рейтинг, текст, дата.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список отзывов с фильтрами.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async getAdminReviews(@Query() query: AdminReviewQueryDto) {
    return this.reviewService.getAdminReviews(query);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Модерация отзыва',
    description: `**Доступ:** ADMIN

**Зачем:** одобрить или отклонить отзыв покупателя.

**Бизнес-логика:**
- \`status\`: \`APPROVED\` — отзыв появляется на витрине, \`REJECTED\` — скрывается
- При одобрении пересчитываются \`averageRating\` и \`reviewCount\` товара
- При отклонении ранее одобренного — также пересчёт

**Статусы:**
- \`PENDING\` → \`APPROVED\` или \`REJECTED\`
- \`APPROVED\` → \`REJECTED\` (убрать с витрины)
- \`REJECTED\` → \`APPROVED\` (вернуть)`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор отзыва',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Статус отзыва обновлён, рейтинг товара пересчитан.',
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
    description: 'Отзыв не найден.',
  })
  async updateReviewStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewService.updateReviewStatus(id, dto);
  }

  @Post(':reviewId/reply')
  @ApiOperation({
    summary: 'Ответить на отзыв',
    description: `**Доступ:** ADMIN

**Зачем:** публичный ответ магазина на отзыв покупателя. Отображается на витрине под отзывом.

**Бизнес-логика:**
- Создаётся отзыв с \`depth: 1\`, \`parentId\` = id корневого отзыва
- \`status: APPROVED\` (ответ админа публикуется сразу)
- Проверяется что родительский отзыв имеет \`depth: 0\` (нельзя отвечать на ответ — только 2 уровня)
- Рейтинг не указывается (это ответ, не оценка)`,
  })
  @ApiParam({
    name: 'reviewId',
    description: 'Идентификатор корневого отзыва',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Ответ создан и сразу опубликован.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или попытка ответить на ответ (depth > 0).',
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
    description: 'Отзыв не найден.',
  })
  async replyToReview(
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @CurrentUser('id') adminUserId: number,
    @Body() dto: AdminReplyReviewDto,
  ) {
    return this.reviewService.replyToReview(reviewId, adminUserId, dto);
  }
}
