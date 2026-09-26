import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { StockNotificationController } from './stock-notification.controller';
import { StockNotificationService } from './stock-notification.service';

@Module({
  imports: [EmailModule],
  controllers: [StockNotificationController],
  providers: [StockNotificationService],
  exports: [StockNotificationService],
})
export class StockNotificationModule {}
