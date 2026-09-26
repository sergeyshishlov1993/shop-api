import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseService } from './expense.service';

@ApiTags('Admin — Витрати')
@Controller('admin/expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Get()
  @ApiOperation({
    summary: 'Список витрат',
    description: `**Доступ:** ADMIN

**Зачем:** учёт операционных расходов магазина — реклама, упаковка, зарплата, аренда, логистика и т.д. Используется для расчёта чистой прибыли в финансовых отчётах.

**Фильтры:**
- \`category\` — категория расхода (ADVERTISING, PACKAGING, SALARY, RENT, LOGISTICS, OTHER)
- \`dateFrom\`, \`dateTo\` — диапазон дат
- \`search\` — по описанию

**Сортировка:** по дате (newest first)
**Пагинация:** \`page\`, \`limit\`

**Ответ:** items[] с id, category, amount, description, date, createdAt + totalCount + totalAmount (сумма по фильтрам).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список витрат з пагінацією та загальною сумою.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные параметры запроса.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  getExpenses(@Query() query: QueryExpensesDto) {
    return this.expenseService.findAll(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать витрату',
    description: `**Доступ:** ADMIN

**Зачем:** фиксация расхода для финансового учёта.

**Поля:**
- \`category\` — категория расхода (enum)
- \`amount\` — сумма в основной валюте магазина (UAH)
- \`description\` — описание (что, зачем, кому)
- \`date\` — дата расхода (может отличаться от даты создания записи)`,
  })
  @ApiResponse({
    status: 201,
    description: 'Витрата створена.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.expenseService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить витрату',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** частичное обновление — category, amount, description, date.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор витрати',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Витрата оновлена.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Витрата не знайдена.',
  })
  updateExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenseService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Видалити витрату',
    description: `**Доступ:** ADMIN

**Бизнес-логика:** фізичне видалення запису. Вплине на фінансові звіти за відповідний період.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор витрати',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Витрата видалена.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ только для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Витрата не знайдена.',
  })
  deleteExpense(@Param('id', ParseIntPipe) id: number) {
    return this.expenseService.remove(id);
  }
}
