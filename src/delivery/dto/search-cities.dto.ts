import { IsString, MinLength } from 'class-validator';

export class SearchCitiesDto {
    @IsString()
    @MinLength(1)
    search!: string;
}