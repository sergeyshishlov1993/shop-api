import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsAdminController } from './settings-admin.controller';
import { SettingsStorefrontController } from './settings-storefront.controller';

@Module({
  controllers: [SettingsAdminController, SettingsStorefrontController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
