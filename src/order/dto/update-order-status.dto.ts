import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  newStatus!: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
