import { MediaType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateHeroSlideDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  buttonText?: string;

  @IsOptional()
  @IsString()
  // Только внутренний путь или http(s) — без javascript:/data: и protocol-relative //
  @Matches(/^($|\/(?![/\\])|https?:\/\/)/, { message: 'buttonLink must start with / or http(s)://' })
  buttonLink?: string;

  @IsInt()
  mediaFileId!: number;

  @IsEnum(MediaType)
  mediaType!: MediaType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
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
