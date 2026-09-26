import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationSettingsService } from './notification-settings.service';

@ApiTags('Admin — Налаштування сповіщень')
@Controller('admin/notification-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class NotificationSettingsController {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Поточні налаштування сповіщень',
    description: `**Доступ:** ADMIN

**Зачем:** перегляд поточних налаштувань Telegram-сповіщень.

**Ответ:**
- \`telegramBotToken\` — токен бота (замаскований: перші 5 символів + ***)
- \`telegramChatId\` — ID чату для сповіщень
- \`notifyOnNewOrder\` — сповіщати про нові замовлення
- \`notifyOnNewReview\` — сповіщати про нові відгуки
- \`notifyOnNewFeedback\` — сповіщати про нові звернення
- \`notifyOnLowStock\` — сповіщати про низькі залишки`,
  })
  @ApiResponse({
    status: 200,
    description: 'Налаштування сповіщень.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getSettings() {
    return this.notificationSettingsService.getSettings();
  }

  @Patch()
  @ApiOperation({
    summary: 'Оновити налаштування сповіщень',
    description: `**Доступ:** ADMIN

**Бізнес-логіка:** часткове оновлення. Можна змінити окремі поля:
- Токен бота та chatId — для зміни каналу сповіщень
- Прапорці notifyOn* — для включення/вимкнення окремих типів сповіщень

**Важливо:** при зміні telegramBotToken або telegramChatId — відправляється тестове повідомлення для перевірки з'єднання. Якщо бот не може відправити — помилка 400.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Налаштування оновлено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Помилка валідації або не вдалось відправити тестове повідомлення.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  updateSettings(@Body() dto: UpdateNotificationSettingsDto) {
    return this.notificationSettingsService.updateSettings(dto);
  }
}
