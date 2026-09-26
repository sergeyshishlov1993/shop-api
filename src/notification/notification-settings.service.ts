import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getSettings() {
    const settings = await this.prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
    const token = settings.telegramBotToken || this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    return {
      telegramBotToken: token ? `${token.slice(0, 5)}***` : null,
      hasTelegramBotToken: Boolean(token),
      telegramChatId: settings.telegramAdminChatId || this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID') || null,
      notifyOnNewOrder: settings.notifyOnNewOrder,
      notifyOnNewReview: settings.notifyOnNewReview,
      notifyOnNewFeedback: settings.notifyOnNewFeedback,
      notifyOnLowStock: settings.notifyOnLowStock,
    };
  }

  async updateSettings(dto: UpdateNotificationSettingsDto) {
    const current = await this.prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
    const token = dto.telegramBotToken || current.telegramBotToken || this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = dto.telegramChatId || current.telegramAdminChatId || this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID');

    if ((dto.telegramBotToken || dto.telegramChatId) && (!token || !chatId)) {
      throw new BadRequestException('Для перевірки Telegram потрібні token і chat ID');
    }
    if (dto.telegramBotToken || dto.telegramChatId) {
      try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: 'Stella Admin: налаштування сповіщень успішно оновлено.',
        });
      } catch {
        throw new BadRequestException('Не вдалося надіслати тестове повідомлення Telegram');
      }
    }

    await this.prisma.storeSettings.update({
      where: { id: 1 },
      data: {
        ...(dto.telegramBotToken ? { telegramBotToken: dto.telegramBotToken } : {}),
        ...(dto.telegramChatId ? { telegramAdminChatId: dto.telegramChatId } : {}),
        ...(typeof dto.notifyOnNewOrder === 'boolean' ? { notifyOnNewOrder: dto.notifyOnNewOrder } : {}),
        ...(typeof dto.notifyOnNewReview === 'boolean' ? { notifyOnNewReview: dto.notifyOnNewReview } : {}),
        ...(typeof dto.notifyOnNewFeedback === 'boolean' ? { notifyOnNewFeedback: dto.notifyOnNewFeedback } : {}),
        ...(typeof dto.notifyOnLowStock === 'boolean' ? { notifyOnLowStock: dto.notifyOnLowStock } : {}),
      },
    });
    return this.getSettings();
  }
}
