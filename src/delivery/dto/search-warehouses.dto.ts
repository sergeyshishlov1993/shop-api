import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchWarehousesDto {
    @IsString()
    @MinLength(1)
    city!: string;

    @IsOptional()
    @IsString()
    search?: string;
}