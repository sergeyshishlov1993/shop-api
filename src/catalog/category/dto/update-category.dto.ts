import { IsString, IsNotEmpty, IsInt, IsBoolean, IsOptional, IsEnum, Matches, Min, IsNumber, Max } from 'class-validator';
import { ProductType } from '@prisma/client';

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  @IsOptional()
  slug?: string;

  @IsInt()
  @IsOptional()
  parentId?: number | null;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType | null;

  @IsInt()
  @IsOptional()
  imageFileId?: number | null;

  @IsInt()
  @IsOptional()
  bannerFileId?: number | null;

  @IsString()
  @IsOptional()
  metaTitle?: string | null;

  @IsString()
  @IsOptional()
  metaDescription?: string | null;

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
