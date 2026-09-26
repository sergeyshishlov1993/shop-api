import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Admin — Дашборд')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Дашборд адмін-панелі',
    description: `**Доступ:** ADMIN

**Зачем:** головний екран адмін-панелі — ключові метрики в реальному часі.

**Ответ:**

**today** — показники за сьогодні:
- \`ordersCount\` — кількість нових замовлень
- \`revenue\` — виручка (тільки DELIVERED)
- \`averageCheck\` — середній чек

**week** — показники за поточний тиждень (пн-нд):
- Ті самі метрики + порівняння з минулим тижнем (\`changePercent\`)

**month** — показники за поточний місяць:
- Ті самі метрики + порівняння з минулим місяцем

**pendingActions** — що потребує уваги:
- \`newOrders\` — замовлення зі статусом NEW (потребують підтвердження)
- \`pendingReviews\` — відгуки зі статусом PENDING (потребують модерації)
- \`newFeedback\` — обращення зі статусом NEW
- \`lowStockVariants\` — варіанти з availableQty ≤ lowStockThreshold

**topProducts** — топ-5 товарів за тиждень по кількості проданих одиниць

**recentOrders** — останні 5 замовлень (orderNumber, status, totalAmount, createdAt)`,
  })
  @ApiResponse({
    status: 200,
    description: 'Дані дашборду.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}
