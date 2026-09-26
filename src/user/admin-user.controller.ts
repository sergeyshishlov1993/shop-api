import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { CurrentUser, Roles, SwaggerJwtAuth } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminGetUsersQueryDto } from './dto/admin-get-users-query.dto';
import { AdminUserService } from './admin-user.service';

@ApiTags('Admin — Пользователи')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  @ApiOperation({
    summary: 'Список пользователей',
    description: `**Доступ:** ADMIN

**Зачем:** управление клиентской базой — просмотр, поиск, назначение персональных скидок.

**Фильтры:**
- \`search\` — по email, firstName, lastName, phone (частичное совпадение)
- \`role\` — USER или ADMIN

**Сортировка:** по дате регистрации (newest first)
**Пагинация:** \`page\`, \`limit\`

**Ответ:** items[] с id, email, firstName, lastName, phone, role, personalDiscountPercent, ordersCount, totalSpent, createdAt + totalCount.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список пользователей с пагинацией.',
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
  getUsers(@Query() query: AdminGetUsersQueryDto) {
    return this.adminUserService.getUsers(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Пользователь по id',
    description: `**Доступ:** ADMIN

**Ответ:** полные данные пользователя:
- Профиль: email, firstName, lastName, phone, role, avatarUrl, personalDiscountPercent, createdAt
- Статистика: ordersCount, totalSpent, averageOrderAmount
- Последние заказы (до 5): orderNumber, status, totalAmount, createdAt
- Профили доставки: все сохранённые адреса`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор пользователя',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Полные данные пользователя.',
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
    description: 'Пользователь не найден.',
  })
  getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserService.getUserById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить пользователя',
    description: `**Доступ:** ADMIN

**Зачем:** назначение персональной скидки, смена роли, редактирование данных клиента.

**Редактируемые поля:**
- \`personalDiscountPercent\` — персональная скидка (0–100%). Применяется автоматически при оформлении заказа
- \`role\` — USER или ADMIN (назначение администратором)
- \`firstName\`, \`lastName\`, \`phone\` — данные профиля

**Бизнес-логика:**
- Админ не может понизить свою роль (защита от случайного лишения доступа)
- При изменении role на ADMIN — пользователь получает доступ ко всем admin-эндпоинтам`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор пользователя',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Пользователь обновлён.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или попытка понизить свою роль.',
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
    description: 'Пользователь не найден.',
  })
  updateUser(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminUserService.updateUser(id, dto, currentUserId);
  }
}
