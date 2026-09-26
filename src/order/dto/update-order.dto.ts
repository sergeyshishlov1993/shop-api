import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  internalComment?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
