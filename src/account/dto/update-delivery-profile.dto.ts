import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDeliveryProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientFirstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientLastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  deliveryProvider?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  city?: string;

  @IsOptional()
  @IsString()
  warehouse?: string;

  @IsOptional()
  @IsString()
  addressLine?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
