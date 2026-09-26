import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { AdminCouponController } from './admin-coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  controllers: [CouponController, AdminCouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
