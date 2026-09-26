import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  /** ID заказа, для которого создаётся онлайн-платёж. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId!: number;
}
