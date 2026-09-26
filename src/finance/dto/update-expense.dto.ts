import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { ExpenseType } from '@prisma/client';

export class UpdateExpenseDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsEnum(ExpenseType)
    type?: ExpenseType;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount?: number;

    @IsOptional()
    @IsDateString()
    expenseDate?: string;

    @IsOptional()
    @IsString()
    note?: string;
}