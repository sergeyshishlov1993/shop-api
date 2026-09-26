import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { EmailModule } from '../email/email.module';
import { CouponModule } from '../coupon/coupon.module';
import { OrderController } from './order.controller';
import { AdminOrderController } from './admin-order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [DeliveryModule, EmailModule, CouponModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
