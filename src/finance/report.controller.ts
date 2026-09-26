import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { QueryReportDto } from './dto/query-report.dto';
import { ReportService } from './report.service';

@ApiTags('Admin — Фінансові звіти')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Зведений фінансовий звіт',
    description: `**Доступ:** ADMIN

**Зачем:** головний фінансовий звіт за період — виручка, собівартість, валовий прибуток, витрати, чистий прибуток.

**Параметри:**
- \`dateFrom\`, \`dateTo\` — період звіту (обов'язково)

**Розрахунок (на основі DELIVERED заказів):**
- \`revenue\` — сума totalAmount доставлених замовлень
- \`cost\` — сума totalCost (собівартість товарів)
- \`grossProfit\` — revenue - cost
- \`expenses\` — сума всіх витрат (Expense) за період
- \`netProfit\` — grossProfit - expenses
- \`ordersCount\` — кількість доставлених замовлень
- \`averageOrderAmount\` — revenue / ordersCount
- \`marginPercent\` — (grossProfit / revenue) × 100

**Важливо:** враховуються тільки замовлення зі статусом DELIVERED, де \`updatedAt\` (дата доставки) потрапляє в період.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Зведений фінансовий звіт.',
  })
  @ApiResponse({
    status: 400,
    description: 'Не вказано dateFrom/dateTo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getSummary(@Query() query: QueryReportDto) {
    return this.reportService.getReport(query);
  }

  @Get('by-day')
  @ApiOperation({
    summary: 'Звіт по днях',
    description: `**Доступ:** ADMIN

**Зачем:** графік динаміки продажів — виручка, кількість замовлень, прибуток по днях. Для побудови лінійних/стовпчикових графіків в дашборді.

**Параметри:** \`dateFrom\`, \`dateTo\`

**Ответ:** масив \`[{ date, revenue, cost, grossProfit, expenses, netProfit, ordersCount }]\` — по одному елементу на кожен день періоду. Дні без замовлень включаються з нульовими значеннями.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Масив даних по днях.',
  })
  @ApiResponse({
    status: 400,
    description: 'Не вказано dateFrom/dateTo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getByDay(@Query() query: QueryReportDto) {
    return this.reportService.getByDay(query);
  }

  @Get('by-category')
  @ApiOperation({
    summary: 'Звіт по категоріях',
    description: `**Доступ:** ADMIN

**Зачем:** аналітика продажів по категоріях товарів — яка категорія приносить більше виручки/прибутку.

**Параметри:** \`dateFrom\`, \`dateTo\`

**Ответ:** масив \`[{ categoryId, categoryName, revenue, cost, grossProfit, ordersCount, itemsSold }]\` — агреговані дані по категоріях з OrderItem снепшотів.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Масив даних по категоріях.',
  })
  @ApiResponse({
    status: 400,
    description: 'Не вказано dateFrom/dateTo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getByCategory(@Query() query: QueryReportDto) {
    return this.reportService.getByCategory(query);
  }

  @Get('by-product')
  @ApiOperation({
    summary: 'Звіт по товарах',
    description: `**Доступ:** ADMIN

**Зачем:** топ товарів за період — які товари продаються найкраще, які найприбутковіші.

**Параметри:** \`dateFrom\`, \`dateTo\`

**Ответ:** масив \`[{ productId, productName, sku, revenue, cost, grossProfit, itemsSold, marginPercent }]\` — відсортований по revenue DESC. Дані з OrderItem снепшотів (productName на момент замовлення).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Масив даних по товарах.',
  })
  @ApiResponse({
    status: 400,
    description: 'Не вказано dateFrom/dateTo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getByProduct(@Query() query: QueryReportDto) {
    return this.reportService.getByProduct(query);
  }

  @Get('expenses-by-category')
  @ApiOperation({
    summary: 'Витрати по категоріях',
    description: `**Доступ:** ADMIN

**Зачем:** аналітика витрат — скільки витрачено на рекламу, упаковку, зарплату тощо.

**Параметри:** \`dateFrom\`, \`dateTo\`

**Ответ:** масив \`[{ category, totalAmount, count }]\` — агреговані витрати по категоріях (ADVERTISING, PACKAGING, SALARY, RENT, LOGISTICS, OTHER).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Масив витрат по категоріях.',
  })
  @ApiResponse({
    status: 400,
    description: 'Не вказано dateFrom/dateTo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getExpensesByCategory(@Query() query: QueryReportDto) {
    return this.reportService.getExpensesByCategory(query);
  }
}
