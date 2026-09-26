import { CouponDiscountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  code!: string;

  @IsEnum(CouponDiscountType)
  discountType!: CouponDiscountType;

  @IsNumber()
  @Min(0)
  discountValue!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSubtotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
