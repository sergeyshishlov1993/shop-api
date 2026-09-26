import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CacheService } from '../../cache/cache.service';
import { SizeChartService } from './size-chart.service';

@ApiTags('Storefront — Размерные сетки')
@Controller('storefront/categories/:categoryId/size-chart')
export class SizeChartStorefrontController {
    constructor(
        private readonly sizeChartService: SizeChartService,
        private readonly cacheService: CacheService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Размерная сетка категории (публичный)' })
    @ApiParam({ name: 'categoryId', example: 1 })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 404 })
    async findByCategoryId(
        @Param('categoryId', ParseIntPipe) categoryId: number,
    ) {
        const cacheKey = `size-chart:${categoryId}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;

        const result = await this.sizeChartService.findByCategoryId(categoryId);
        await this.cacheService.set(cacheKey, result, 300);
        return result;
    }
}