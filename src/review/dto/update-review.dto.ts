import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  // multipart sends a single value as string, several as array
  @IsOptional()
  @Transform(({ value }) => ([] as unknown[]).concat(value).map(Number))
  @IsArray()
  @IsInt({ each: true })
  removeMediaIds?: number[];
}
