import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { FileModule } from '../file/file.module';
import { StockNotificationModule } from '../stock-notification/stock-notification.module';
import { AdminReturnsController } from './admin-returns.controller';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [FileModule, EmailModule, StockNotificationModule],
  controllers: [ReturnsController, AdminReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
