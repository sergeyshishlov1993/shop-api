import {
    IsOptional,
    IsString,
    IsInt,
    IsNumber,
    IsBoolean,
    IsEnum,
    Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductType } from '@prisma/client';
import { sanitizeString } from '../../../common/utils/sanitize';

export enum StorefrontSort {
    NEWEST = 'newest',
    PRICE_ASC = 'price_asc',
    PRICE_DESC = 'price_desc',
    NAME_ASC = 'name_asc',
}

/**
 * Мультивыбор в query приходит либо повторами (?color=1&color=2),
 * либо через запятую (?color=1,2). Приводим оба вида к массиву.
 * Значения сортируются, чтобы ключ кэша не зависел от порядка кликов.
 */
function toStringArray(value: unknown): string[] | undefined {
    if (value === undefined || value === null) return undefined;
    const raw = Array.isArray(value) ? value : String(value).split(',');
    const cleaned = raw
        .map((item) => sanitizeString(String(item)))
        .filter((item): item is string => item !== undefined);
    return cleaned.length ? [...new Set(cleaned)].sort() : undefined;
}

function toIntArray(value: unknown): number[] | undefined {
    const strings = toStringArray(value);
    if (!strings) return undefined;
    const numbers = strings
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item));
    return numbers.length ? [...new Set(numbers)].sort((a, b) => a - b) : undefined;
}

export class QueryStorefrontProductsDto {
    @IsString()
    @IsOptional()
    @Transform(({ value }) => sanitizeString(value))
    category?: string;

    @IsEnum(ProductType, { each: true })
    @IsOptional()
    @Transform(({ value }) => toStringArray(value))
    productType?: ProductType[];

    @IsInt({ each: true })
    @IsOptional()
    @Transform(({ value }) => toIntArray(value))
    size?: number[];

    @IsInt({ each: true })
    @IsOptional()
    @Transform(({ value }) => toIntArray(value))
    color?: number[];

    @IsString({ each: true })
    @IsOptional()
    @Transform(({ value }) => toStringArray(value))
    brand?: string[];

    @IsString({ each: true })
    @IsOptional()
    @Transform(({ value }) => toStringArray(value))
    season?: string[];

    @IsString({ each: true })
    @IsOptional()
    @Transform(({ value }) => toStringArray(value))
    material?: string[];

    @IsNumber()
    @Type(() => Number)
    @Min(0)
    @IsOptional()
    priceMin?: number;

    @IsNumber()
    @Type(() => Number)
    @Min(0)
    @IsOptional()
    priceMax?: number;

    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsOptional()
    isNew?: boolean;

    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsOptional()
    isHit?: boolean;

    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsOptional()
    isSeasonal?: boolean;

    // ID промо-блоку (тип CUSTOM): лише товари цієї ручної добірки
    @IsInt()
    @Min(1)
    @Type(() => Number)
    @IsOptional()
    promo?: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => sanitizeString(value))
    search?: string;

    @IsEnum(StorefrontSort)
    @IsOptional()
    sort?: StorefrontSort = StorefrontSort.NEWEST;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @IsOptional()
    limit?: number = 20;

    @IsString()
    @IsOptional()
    utm_source?: string;

    @IsString()
    @IsOptional()
    utm_medium?: string;

    @IsString()
    @IsOptional()
    utm_campaign?: string;

    @IsString()
    @IsOptional()
    utm_content?: string;

    @IsString()
    @IsOptional()
    utm_term?: string;

    @IsString()
    @IsOptional()
    utmSource?: string;

    @IsString()
    @IsOptional()
    utmMedium?: string;

    @IsString()
    @IsOptional()
    utmCampaign?: string;

    @IsString()
    @IsOptional()
    utmContent?: string;

    @IsString()
    @IsOptional()
    utmTerm?: string;
}