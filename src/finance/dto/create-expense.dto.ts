import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { ExpenseType } from '@prisma/client';

export class CreateExpenseDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsEnum(ExpenseType)
    type!: ExpenseType;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount!: number;

    @IsDateString()
    expenseDate!: string;

    @IsOptional()
    @IsString()
    note?: string;
}