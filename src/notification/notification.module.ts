import { Global, Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { TelegramService } from './telegram.service';

@Global()
@Module({
    controllers: [NotificationSettingsController],
    providers: [TelegramService, NotificationSettingsService],
    exports: [TelegramService],
})
export class NotificationModule {}