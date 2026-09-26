import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsInt()
  @IsOptional()
  sizeId?: number;

  @IsInt()
  @IsOptional()
  colorId?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockQty?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
