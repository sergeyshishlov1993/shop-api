import { Transform } from 'class-transformer';
import { PromoBlockType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class GetAdminPromoBlocksQueryDto {
  @IsOptional()
  @IsEnum(PromoBlockType)
  type?: PromoBlockType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
