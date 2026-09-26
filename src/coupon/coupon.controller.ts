import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { CouponService } from './coupon.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Storefront — Промокоды')
@Controller('storefront/coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Проверить промокод под сумму корзины' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponService.validate(dto.code, dto.subtotal);
  }
}
