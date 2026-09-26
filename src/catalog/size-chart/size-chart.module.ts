import { Module } from '@nestjs/common';
import { SizeChartController } from './size-chart.controller';
import { SizeChartStorefrontController } from './size-chart-storefront.controller';
import { SizeChartService } from './size-chart.service';

@Module({
    controllers: [SizeChartController, SizeChartStorefrontController],
    providers: [SizeChartService],
    exports: [SizeChartService],
})
export class SizeChartModule {}