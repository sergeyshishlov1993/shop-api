import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

class LabelItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  copies?: number;
}

export class PrintLabelsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LabelItemDto)
  items!: LabelItemDto[];
}
