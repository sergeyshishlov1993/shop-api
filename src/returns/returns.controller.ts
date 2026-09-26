import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnTrackingDto } from './dto/update-tracking.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Storefront — Повернення')
@Controller('storefront/account')
@UseGuards(JwtAuthGuard)
@SwaggerJwtAuth()
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get('returns')
  @ApiOperation({
    summary: 'Мої повернення',
    description: `**Доступ:** авторизований користувач (JWT)

**Відповідь:** масив ReturnSummary (найновіші першими).`,
  })
  @ApiResponse({ status: 200, description: 'Список заявок на повернення.' })
  findMine(@CurrentUser('id') userId: number) {
    return this.returnsService.findMine(userId);
  }

  @Post('returns/photos')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Завантажити фото для заявки на повернення (JPEG/PNG/WebP, ≤10 МБ)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Фото завантажено: { id, url }.' })
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.returnsService.uploadPhoto(file);
  }

  @Get('returns/:id')
  @ApiOperation({ summary: 'Деталі моєї заявки на повернення' })
  @ApiResponse({ status: 404, description: 'Заявку не знайдено.' })
  findMineById(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.returnsService.findMineById(userId, id);
  }

  @Get('orders/:orderId/return-eligibility')
  @ApiOperation({
    summary: 'Чи можна повернути товари із замовлення',
    description: `**Бізнес-логіка:** лише власне замовлення у статусі DELIVERED, протягом \`returnWindowDays\` днів після доставки. Для кожної позиції повертається \`returnableQty\` (куплено мінус вже заявлено в активних поверненнях).`,
  })
  getEligibility(
    @CurrentUser('id') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.returnsService.getEligibility(userId, orderId);
  }

  @Post('returns')
  @ApiOperation({
    summary: 'Створити заявку на повернення',
    description: `**Бізнес-логіка:** перевіряється право на повернення та кількість по кожній позиції. Номер формату RET-YYYYMMDD-NNNN. Клієнту надсилається лист.`,
  })
  @ApiResponse({ status: 201, description: 'Заявку створено.' })
  @ApiResponse({ status: 400, description: 'Повернення неможливе або помилка валідації.' })
  create(@CurrentUser('id') userId: number, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(userId, dto);
  }

  @Post('returns/:id/cancel')
  @ApiOperation({ summary: 'Скасувати заявку (лише у статусі NEW)' })
  cancel(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.returnsService.cancel(userId, id);
  }

  @Patch('returns/:id/tracking')
  @ApiOperation({ summary: 'Вказати ТТН зворотної посилки (лише у статусі APPROVED)' })
  updateTracking(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReturnTrackingDto,
  ) {
    return this.returnsService.updateTracking(userId, id, dto.trackingNumber);
  }
}
