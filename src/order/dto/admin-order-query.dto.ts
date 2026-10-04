import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class AdminOrderQueryDto {
    @IsOptional()
    @IsEnum(OrderStatus)
    status?: OrderStatus;

    /** true — лише архівні; за замовчуванням архівні приховані */
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    archived?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    userId?: number;

    @IsOptional()
    @IsString()
    dateFrom?: string;

    @IsOptional()
    @IsString()
    dateTo?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    utmSource?: string;

    @IsOptional()
    @IsString()
    utmMedium?: string;

    @IsOptional()
    @IsString()
    utmCampaign?: string;

    @IsOptional()
    @IsString()
    utmContent?: string;

    @IsOptional()
    @IsString()
    utmTerm?: string;

    @IsOptional()
    @IsIn(['createdAt'])
    sort?: 'createdAt';

    @IsOptional()
    @IsIn(['asc', 'desc'])
    order?: 'asc' | 'desc';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;
}