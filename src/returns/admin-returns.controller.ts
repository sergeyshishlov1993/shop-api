import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerAdminAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { QueryAdminReturnsDto } from './dto/query-admin-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { ReturnsService } from './returns.service';

@ApiTags('Admin — Повернення')
@Controller('admin/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerAdminAuth()
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @ApiOperation({
    summary: 'Список заявок на повернення',
    description: `**Доступ:** ADMIN

**Фільтри:** \`status\`, \`search\` (номер повернення, номер замовлення, телефон, імʼя).
**Пагінація:** \`page\`, \`limit\`.

**Відповідь:** { items, totalCount, page, limit }.`,
  })
  findAll(@Query() query: QueryAdminReturnsDto) {
    return this.returnsService.findAllAdmin(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Лічильники нових заявок та заявок на розгляді' })
  getStats() {
    return this.returnsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Деталі заявки на повернення (реквізити без маскування)' })
  @ApiResponse({ status: 404, description: 'Заявку не знайдено.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.returnsService.findOneAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Змінити статус заявки',
    description: `**Переходи:** NEW→UNDER_REVIEW|REJECTED, UNDER_REVIEW→APPROVED|REJECTED, APPROVED→RECEIVED|REJECTED, RECEIVED→REFUNDED|REJECTED.

- REJECTED потребує \`rejectReason\`
- REFUNDED потребує \`refundAmount > 0\`: створюється витрата типу RETURN; якщо всі позиції замовлення повернено — замовлення переходить у RETURNED.

Кожна зміна пишеться в історію, клієнту надсилається лист.`,
  })
  @ApiResponse({ status: 400, description: 'Недопустимий перехід або помилка валідації.' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReturnStatusDto) {
    return this.returnsService.updateStatus(id, dto);
  }
}
