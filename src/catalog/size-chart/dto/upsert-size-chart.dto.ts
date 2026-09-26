import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class UpsertSizeChartDto {
    @ApiProperty({
        description: 'Заголовки колонок',
        example: ['Розмір', 'Груди (см)', 'Талія (см)', 'Бедра (см)'],
    })
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    columns!: string[];

    @ApiProperty({
        description: 'Строки таблицы (каждая строка — массив значений)',
        example: [
            ['S', '84-88', '64-68', '90-94'],
            ['M', '88-92', '68-72', '94-98'],
        ],
    })
    @IsArray()
    @ArrayMinSize(1)
    rows!: string[][];
}