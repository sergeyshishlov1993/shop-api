import { IsString, IsNotEmpty, IsEnum, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';
import { SizeType } from '@prisma/client';

export class UpdateSizeDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsEnum(SizeType)
  @IsOptional()
  sizeType?: SizeType;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
