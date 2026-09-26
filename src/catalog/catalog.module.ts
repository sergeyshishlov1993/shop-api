import { Module } from '@nestjs/common';
import { SizeModule } from './size/size.module';
import { ColorModule } from './color/color.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { StorefrontModule } from './storefront/storefront.module';
import { SizeChartModule } from './size-chart/size-chart.module';

@Module({
    imports: [SizeModule, ColorModule, CategoryModule, ProductModule, StorefrontModule, SizeChartModule],
})
export class CatalogModule {}