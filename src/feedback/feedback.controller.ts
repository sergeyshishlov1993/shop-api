import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FeedbackStatus } from '@prisma/client';
import { Public, SwaggerJwtAuth } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('Feedback')
@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Public()
  @Post('storefront/feedback')
  @ApiOperation({
    summary: 'Отправить обращение',
    description: `**Доступ:** публичный

**Зачем:** форма обратной связи на витрине — вопросы, жалобы, предложения.

**Бизнес-логика:**
1. Создаётся запись Feedback с \`status: NEW\`
2. Сохраняется IP отправителя (для защиты от спама и идентификации)
3. Telegram уведомление админу: имя, email, тема, текст

**Поля:** name, email, phone (опционально), subject, message`,
  })
  @ApiResponse({
    status: 201,
    description: 'Обращение отправлено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации.',
  })
  create(@Body() dto: CreateFeedbackDto, @Ip() ip: string) {
    return this.feedbackService.create(dto, ip);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SwaggerJwtAuth()
  @Get('admin/feedback')
  @ApiOperation({
    summary: 'Список обращений',
    description: `**Доступ:** ADMIN

**Зачем:** обработка обращений покупателей.

**Фильтры:**
- \`status\` — NEW (новые), IN_PROGRESS (в работе), RESOLVED (решено), SPAM
- \`page\`, \`limit\` — пагинация

**Ответ:** items[] с name, email, phone, subject, message, ip, status, createdAt + totalCount.`,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Статус обращения',
    enum: FeedbackStatus,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Номер страницы',
    example: '1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество на странице',
    example: '20',
  })
  @ApiQuery({
    name: 'deletedOnly',
    required: false,
    description: 'Показати лише приховані звернення',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'Список обращений с пагинацией.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  findAll(
    @Query('status') status?: FeedbackStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('deletedOnly') deletedOnly?: string,
  ) {
    return this.feedbackService.findAll(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      deletedOnly === 'true',
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SwaggerJwtAuth()
  @Patch('admin/feedback/:id/status')
  @ApiOperation({
    summary: 'Обновить статус обращения',
    description: `**Доступ:** ADMIN

**Статусы:** NEW → IN_PROGRESS → RESOLVED. Или NEW/IN_PROGRESS → SPAM (для спам-обращений).`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор обращения',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Статус обновлён.',
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
    description: 'Обращение не найдено.',
  })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.feedbackService.updateStatus(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SwaggerJwtAuth()
  @Delete('admin/feedback/:id')
  @ApiOperation({
    summary: 'Удалить обращение',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** soft delete — проставляется \`deletedAt\`. Обращение скрывается из списка, но сохраняется в БД. Для восстановления — PATCH restore.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор обращения',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Обращение soft-deleted.',
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
    description: 'Обращение не найдено.',
  })
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.feedbackService.softDelete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @SwaggerJwtAuth()
  @Patch('admin/feedback/:id/restore')
  @ApiOperation({
    summary: 'Восстановить обращение',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** убирает \`deletedAt\`, обращение снова появляется в списке.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор обращения',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Обращение восстановлено.',
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
    description: 'Обращение не найдено.',
  })
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.feedbackService.restore(id);
  }
}
