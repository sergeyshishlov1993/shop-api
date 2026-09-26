import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryStorefrontController } from './category-storefront.controller';
import { CategoryService } from './category.service';

@Module({
  controllers: [CategoryController, CategoryStorefrontController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
