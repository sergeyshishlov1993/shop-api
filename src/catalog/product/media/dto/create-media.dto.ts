import {
  IsInt,
  IsEnum,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { MediaType } from '@prisma/client';

export class CreateMediaDto {
  @IsInt()
  fileId!: number;

  @IsEnum(MediaType)
  mediaType!: MediaType;

  @IsInt()
  @IsOptional()
  variantId?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isMain?: boolean;
}
