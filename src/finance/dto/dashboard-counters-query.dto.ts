import { IsDateString, IsOptional } from 'class-validator';

/** Мітки «востаннє переглянуто» розділів (ISO); без мітки рахуються всі записи */
export class DashboardCountersQueryDto {
    @IsOptional()
    @IsDateString()
    reviewsSince?: string;

    @IsOptional()
    @IsDateString()
    usersSince?: string;
}
