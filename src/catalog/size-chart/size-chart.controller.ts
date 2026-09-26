import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Put,
    UseGuards,
} from '@nestjs/common';
import {
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SwaggerJwtAuth } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CacheService } from '../../cache/cache.service';
import { SizeChartService } from './size-chart.service';
import { UpsertSizeChartDto } from './dto/upsert-size-chart.dto';

@ApiTags('Admin — Размерные сетки')
@Controller('admin/categories/:categoryId/size-chart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class SizeChartController {
    constructor(
        private readonly sizeChartService: SizeChartService,
        private readonly cacheService: CacheService,
    ) {}

    @Put()
    @ApiOperation({
        summary: 'Создать или обновить размерную сетку категории',
    })
    @ApiParam({ name: 'categoryId', example: 1 })
    @ApiResponse({ status: 200, description: 'Размерная сетка сохранена.' })
    @ApiResponse({ status: 404, description: 'Категория не найдена.' })
    async upsert(
        @Param('categoryId', ParseIntPipe) categoryId: number,
        @Body() dto: UpsertSizeChartDto,
    ) {
        const result = await this.sizeChartService.upsert(categoryId, dto);
        await this.cacheService.invalidateCategory();
        return result;
    }

    @Get()
    @ApiOperation({ summary: 'Получить размерную сетку категории' })
    @ApiParam({ name: 'categoryId', example: 1 })
    @ApiResponse({ status: 200, description: 'Размерная сетка получена.' })
    @ApiResponse({ status: 404, description: 'Не найдена.' })
    async findByCategoryId(
        @Param('categoryId', ParseIntPipe) categoryId: number,
    ) {
        return this.sizeChartService.findByCategoryId(categoryId);
    }
}