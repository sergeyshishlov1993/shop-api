import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { HealthCheckResponse, HealthService } from './health.service';

@ApiTags('System — Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Проверка состояния сервиса',
    description:
      'Возвращает текущий статус приложения и доступность зависимостей.',
  })
  @ApiResponse({
    status: 200,
    description: 'Сервис работает корректно.',
  })
  getHealth(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }
}
