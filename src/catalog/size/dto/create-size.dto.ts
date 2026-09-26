import { IsString, IsNotEmpty, IsEnum, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';
import { SizeType } from '@prisma/client';

export class CreateSizeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(SizeType)
  sizeType!: SizeType;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
