import { Type } from 'class-transformer';
import {
    IsEmail,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';

export class CreateOrderDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    customerName!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    customerPhone!: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    customerEmail?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    deliveryProfileId?: number;

    @ValidateIf((dto: CreateOrderDto) => !dto.deliveryProfileId)
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    deliveryProvider?: string;

    @ValidateIf((dto: CreateOrderDto) => !dto.deliveryProfileId && dto.deliveryProvider === 'NOVA_POSHTA')
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    city?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    warehouse?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    addressLine?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    postalCode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    comment?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    utmSource?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    utmMedium?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    utmCampaign?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    utmContent?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    utmTerm?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    referer?: string;

    @IsOptional()
    @IsString()
    couponCode?: string;
}
