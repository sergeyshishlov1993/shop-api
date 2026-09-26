import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
    controllers: [ExpenseController, ReportController, DashboardController],
    providers: [ExpenseService, ReportService, DashboardService],
    exports: [ExpenseService, ReportService, DashboardService],
})
export class FinanceModule {}