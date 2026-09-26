import {
  IsInt,
  IsBoolean,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateMediaDto {
  @IsInt()
  @IsOptional()
  variantId?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isMain?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  focalX?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  focalY?: number;
}
