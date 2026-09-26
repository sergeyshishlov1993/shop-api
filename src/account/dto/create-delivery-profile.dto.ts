import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDeliveryProfileDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  recipientFirstName!: string;

  @IsString()
  @MinLength(1)
  recipientLastName!: string;

  @IsString()
  @MinLength(1)
  recipientPhone!: string;

  @IsString()
  @MinLength(1)
  deliveryProvider!: string;

  @IsString()
  @MinLength(1)
  city!: string;

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
