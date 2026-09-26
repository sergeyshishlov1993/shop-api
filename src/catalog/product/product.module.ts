import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { VariantModule } from './variant/variant.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [VariantModule, MediaModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
