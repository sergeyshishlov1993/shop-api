import { IsString, IsNotEmpty, IsInt, IsBoolean, IsOptional, IsEnum, Matches, Min, IsNumber, Max } from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @IsInt()
  @IsOptional()
  parentId?: number;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @IsInt()
  @IsOptional()
  imageFileId?: number;

  @IsInt()
  @IsOptional()
  bannerFileId?: number;

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

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
