import { Type } from 'class-transformer';
import { IsEmail, IsInt, Min } from 'class-validator';

export class SubscribeStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  @IsEmail()
  email!: string;
}
