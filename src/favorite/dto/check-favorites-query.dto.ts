import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class CheckFavoritesQueryDto {
  @Transform(({ value }) =>
    (typeof value === 'string' ? value.split(',') : value).map(Number),
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  productIds!: number[];
}
