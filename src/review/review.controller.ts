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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { CreateReplyDto, CreateReviewDto, GetReviewsDto, UpdateReviewDto } from './dto';
import { CreateReviewResponse, ReviewLikeResponse, ReviewsResponse } from './interfaces';
import { ReviewService } from './review.service';

@ApiTags('Storefront — Отзывы')
@Controller('storefront/products/:productId/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Отзывы о товаре',
    description: `**Доступ:** публичный

**Зачем:** блок отзывов на карточке товара.

**Бизнес-логика:**
- Возвращаются только **одобренные** отзывы (\`status: APPROVED\`)
- Пагинация по корневым отзывам (offset + limit)
- Сортировка \`sort\`: newest (по умолчанию) | oldest | popular | rating_desc | rating_asc — только для корневых
- Ответы (depth 1–2) вложены деревом \`replies[]\`, всегда от старых к новым
- \`likesCount\`, \`likedByMe\` (если передан JWT — опционально)
- Каждый отзыв содержит: rating, text, createdAt, user (firstName, lastName, avatarUrl)

**Структура:** плоский список корневых отзывов, у каждого поле \`replies[]\` с ответами.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Список одобренных отзывов с ответами.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден.',
  })
  async getProductReviews(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() dto: GetReviewsDto,
    @CurrentUser('id') userId?: number,
  ): Promise<ReviewsResponse> {
    return this.reviewService.getProductReviews(productId, dto, userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('media', 5, { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @SwaggerJwtAuth()
  @ApiOperation({
    summary: 'Оставить отзыв',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:**
- \`rating\` — от 1 до 5 звёзд
- \`text\` — текст отзыва
- Отзыв создаётся с \`depth: 0\` (корневой) и \`status: PENDING\`
- **Один корневой отзыв на пользователя на товар** — повторный → ошибка 400
- Отзыв появится на витрине только после одобрения админом (\`status: APPROVED\`)

**Побочные эффекты:**
- Telegram уведомление админу о новом отзыве (товар, рейтинг, текст)
- После одобрения пересчитываются averageRating и reviewCount товара`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Отзыв создан со статусом PENDING, ожидает модерации.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или пользователь уже оставил отзыв на этот товар.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден.',
  })
  async createReview(
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateReviewDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<CreateReviewResponse> {
    return this.reviewService.createReview(productId, userId, dto, files);
  }
}

@ApiTags('Storefront — Отзывы')
@Controller('storefront/reviews/:id')
@UseGuards(JwtAuthGuard)
@SwaggerJwtAuth()
export class ReviewActionsController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('like')
  @ApiOperation({ summary: 'Лайк / снять лайк (toggle) одобренного отзыва или ответа' })
  toggleLike(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ): Promise<ReviewLikeResponse> {
    return this.reviewService.toggleLike(id, userId);
  }

  @Post('replies')
  @UseInterceptors(FilesInterceptor('media', 5, { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Ответить на отзыв',
    description: 'Ответ на одобренный отзыв/ответ. Макс. глубина 2: ответ на depth=2 прикрепляется к его родителю. Статус PENDING.',
  })
  createReply(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateReplyDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<CreateReviewResponse> {
    return this.reviewService.createReply(id, userId, dto, files);
  }

  @Patch()
  @UseInterceptors(FilesInterceptor('media', 5, { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Редактировать свой отзыв/ответ',
    description: 'text, rating (только корневой), removeMediaIds[], новые файлы media (итого ≤5). Ставит editedAt и возвращает в PENDING.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateReviewDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<CreateReviewResponse> {
    return this.reviewService.updateOwnReview(id, userId, dto, files);
  }

  @Delete()
  @ApiOperation({ summary: 'Удалить свой отзыв/ответ (вместе с ответами на него)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ): Promise<{ success: true }> {
    return this.reviewService.deleteOwnReview(id, userId);
  }
}
