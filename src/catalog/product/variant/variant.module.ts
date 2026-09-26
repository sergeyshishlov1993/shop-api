import { Module } from '@nestjs/common';
import { StockNotificationModule } from '../../../stock-notification/stock-notification.module';
import { VariantController } from './variant.controller';
import { VariantService } from './variant.service';

@Module({
  imports: [StockNotificationModule],
  controllers: [VariantController],
  providers: [VariantService],
  exports: [VariantService],
})
export class VariantModule {}
