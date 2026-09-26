import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { OrderStatus, ProductType } from '@prisma/client';

export class QueryReportDto {
    @IsDateString()
    dateFrom!: string;

    @IsDateString()
    dateTo!: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return value.split(',');
        return [value];
    })
    @IsArray()
    @IsEnum(OrderStatus, { each: true })
    orderStatuses?: OrderStatus[] = [OrderStatus.DELIVERED];

    @IsOptional()
    @IsEnum(ProductType)
    productType?: ProductType;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    categoryId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    productId?: number;
}