import { PromoBlockType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, IsNumber, Max } from 'class-validator';

export class CreatePromoBlockDto {
  @IsEnum(PromoBlockType)
  type!: PromoBlockType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  imageFileId?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalY?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalXTablet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalYTablet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalXMobile?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalYMobile?: number;
}
