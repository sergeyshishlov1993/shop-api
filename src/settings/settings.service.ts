import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreSettings } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SINGLETON_ID = 1;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<StoreSettings> {
    const settings = await this.prisma.storeSettings.findUnique({
      where: { id: SINGLETON_ID },
    });

    if (!settings) {
      throw new NotFoundException('Store settings not found. Run seed first.');
    }

    return settings;
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<StoreSettings> {
    await this.getSettings();

    return this.prisma.storeSettings.update({
      where: { id: SINGLETON_ID },
      data: dto,
    });
  }

  getAdminSettings(settings: StoreSettings) {
    const { novaPoshtaApiKey, telegramBotToken, ...adminSettings } = settings;
    return {
      ...adminSettings,
      hasNovaPoshtaApiKey: Boolean(novaPoshtaApiKey?.trim()),
      hasTelegramBotToken: Boolean(telegramBotToken?.trim()),
    };
  }

  getPublicSettings(settings: StoreSettings) {
    // Не отдаём наружу: интеграционные ключи, реквизиты отправителя NP (в т.ч. телефон — PII).
    const {
      telegramAdminChatId, telegramBotToken, novaPoshtaApiKey,
      npSenderRef, npSenderContactRef, npSenderCityRef, npSenderWarehouseRef, npSenderPhone,
      ...publicSettings
    } = settings;
    return publicSettings;
  }
}
