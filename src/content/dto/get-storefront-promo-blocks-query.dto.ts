import { PromoBlockType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class GetStorefrontPromoBlocksQueryDto {
  @IsOptional()
  @IsEnum(PromoBlockType)
  type?: PromoBlockType;
}
