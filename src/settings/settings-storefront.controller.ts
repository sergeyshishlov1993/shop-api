import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SettingsService } from './settings.service';

@ApiTags('Storefront — Настройки')
@Controller('storefront/settings')
export class SettingsStorefrontController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Получить публичные настройки',
    description:
      'Возвращает публично доступные настройки приложения для витрины.',
  })
  @ApiResponse({
    status: 200,
    description: 'Публичные настройки успешно получены.',
  })
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    return this.settingsService.getPublicSettings(settings);
  }
}
