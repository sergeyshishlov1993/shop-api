import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Admin — Настройки')
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class SettingsAdminController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Получить настройки',
    description:
      'Возвращает текущие настройки приложения для административной панели. Доступно только пользователю с ролью ADMIN.',
  })
  @ApiResponse({
    status: 200,
    description: 'Настройки успешно получены.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    return this.settingsService.getAdminSettings(settings);
  }

  @Patch()
  @ApiOperation({
    summary: 'Обновить настройки',
    description:
      'Обновляет настройки приложения. Доступно только пользователю с ролью ADMIN.',
  })
  @ApiResponse({
    status: 200,
    description: 'Настройки успешно обновлены.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации входных данных.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    const settings = await this.settingsService.updateSettings(dto);
    return this.settingsService.getAdminSettings(settings);
  }
}
