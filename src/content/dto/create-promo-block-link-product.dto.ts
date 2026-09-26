import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreatePromoBlockLinkProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
