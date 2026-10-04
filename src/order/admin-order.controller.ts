import {
    Body,
    Controller,
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
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { ArchiveOrderDto } from './dto/archive-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderService } from './order.service';

@ApiTags('Admin — Заказы')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class AdminOrderController {
    constructor(private readonly orderService: OrderService) {}

    @Get()
    @ApiOperation({
        summary: 'Список заказов',
        description: `**Доступ:** ADMIN

**Зачем:** управление заказами — просмотр, фильтрация, поиск.

**Фильтры:**
- \`status\` — NEW, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, RETURNED
- \`dateFrom\`, \`dateTo\` — диапазон дат создания
- \`search\` — по orderNumber, customerName, customerPhone, customerEmail

**Сортировка:** по дате создания (newest first по умолчанию)
**Пагинация:** \`page\`, \`limit\`

**Ответ:** items[] с orderNumber, status, customerName, totalAmount, itemsCount, createdAt + totalCount для пагинации.`,
    })
    @ApiResponse({
        status: 200,
        description: 'Список заказов с фильтрами и пагинацией.',
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
    async getOrders(@Query() query: AdminOrderQueryDto) {
        const result = await this.orderService.getAdminOrders(query);
        return {
            items: result.items,
            totalCount: result.meta.total,
            page: result.meta.page,
            limit: result.meta.limit,
            totalPages: result.meta.totalPages,
        };
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Детали заказа',
        description: `**Доступ:** ADMIN

**Ответ:** полные данные заказа:
- Финансы: subtotal, discount, deliveryAmount, totalAmount, totalCost, grossProfit, netProfit
- Items[] со снепшотами: productName, category, type, sku, size, color, salePrice, purchaseCost, qty, lineRevenue/Cost/Profit
- Данные доставки: customerName/Phone/Email, deliveryProvider, city, warehouse, addressLine
- StatusHistory[]: хронология смен статусов (oldStatus → newStatus, createdAt)
- Пользователь (если авторизован): id, email, firstName, lastName
- idempotencyKey, comment`,
    })
    @ApiParam({
        name: 'id',
        description: 'Идентификатор заказа',
        example: 1,
    })
    @ApiResponse({
        status: 200,
        description: 'Полные данные заказа.',
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
        description: 'Заказ не найден.',
    })
    getOrderById(@Param('id', ParseIntPipe) id: number) {
        return this.orderService.getAdminOrderById(id);
    }

    @Get(':id/tracking')
    @ApiOperation({
        summary: 'Получить статус отслеживания посылки',
        description: `**Доступ:** ADMIN

**Зачем:** отслеживание статуса доставки по ТТН Новой Почты.

**Условия:**
- У заказа должен быть заполнен trackingNumber
- Делается запрос к API Новой Почты

**Ответ:** ttn, statusCode, statusDescription или null (если ТТН не указан или запрос неудачен).`,
    })
    @ApiParam({
        name: 'id',
        description: 'Идентификатор заказа',
        example: 1,
    })
    @ApiResponse({
        status: 200,
        description: 'Информация об отслеживании получена.',
    })
    @ApiResponse({
        status: 404,
        description: 'Заказ не найден или ТТН не указан.',
    })
    getOrderTracking(@Param('id', ParseIntPipe) id: number) {
        return this.orderService.getOrderTracking(id);
    }

    @Patch(':id/status')
    @ApiOperation({
        summary: 'Изменить статус заказа',
        description: `**Доступ:** ADMIN

**Зачем:** продвижение заказа по воронке: NEW → CONFIRMED → SHIPPED → DELIVERED. Или отмена/возврат.

**Допустимые переходы:**
- \`NEW\` → CONFIRMED, CANCELLED
- \`CONFIRMED\` → SHIPPED, CANCELLED
- \`SHIPPED\` → DELIVERED, RETURNED
- \`DELIVERED\` → RETURNED
- \`CANCELLED\` и \`RETURNED\` — финальные, менять нельзя

**Побочные эффекты при CANCELLED/RETURNED:**
1. \`reservedQty\` вариантов уменьшается на qty заказа (товар возвращается в доступные остатки)
2. Финансовая запись корректируется (для отчётов)

**Побочные эффекты при DELIVERED:**
1. \`stockQty\` вариантов уменьшается, \`reservedQty\` уменьшается (товар физически отгружен)
2. Заказ попадает в финансовый отчёт как реализованный

Создаётся запись в OrderStatusHistory (oldStatus → newStatus).`,
    })
    @ApiParam({
        name: 'id',
        description: 'Идентификатор заказа',
        example: 1,
    })
    @ApiResponse({
        status: 200,
        description: 'Статус обновлён, остатки скорректированы.',
    })
    @ApiResponse({
        status: 400,
        description: 'Недопустимый переход статусов или ошибка валидации.',
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
        description: 'Заказ не найден.',
    })
    updateOrderStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateOrderStatusDto,
    ) {
        return this.orderService.updateOrderStatus(id, dto);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Редактировать заказ',
        description: `**Доступ:** ADMIN

**Зачем:** изменить данные доставки, комментарий, стоимость доставки. Редактирование позиций не поддерживается (снепшоты неизменны).

**Редактируемые поля:** customerName, customerPhone, customerEmail, deliveryProvider, city, warehouse, addressLine, deliveryAmount, comment.

**Бизнес-логика:** при изменении deliveryAmount пересчитывается totalAmount.`,
    })
    @ApiParam({
        name: 'id',
        description: 'Идентификатор заказа',
        example: 1,
    })
    @ApiResponse({
        status: 200,
        description: 'Заказ обновлён.',
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
        description: 'Заказ не найден.',
    })
    updateOrder(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateOrderDto,
    ) {
        return this.orderService.updateAdminOrder(id, dto);
    }

    @Patch(':id/archive')
    @ApiOperation({
        summary: 'Архівувати / відновити заказ',
        description: `**Доступ:** ADMIN

**Зачем:** прибрати непотрібні (тестові, дублі) заказы без видалення.

**Тело:** \`{ archived: true }\` — в архів, \`{ archived: false }\` — відновити.

**Бизнес-логика:** архівний заказ не показується в списку (лише з \`archived=true\`) і не враховується в дашборді та звітах. У кабінеті покупця він лишається.`,
    })
    @ApiParam({ name: 'id', description: 'Идентификатор заказа', example: 1 })
    @ApiResponse({ status: 200, description: '{ id, archivedAt }' })
    @ApiResponse({ status: 404, description: 'Заказ не найден.' })
    archiveOrder(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ArchiveOrderDto,
    ) {
        return this.orderService.setOrderArchived(id, dto.archived);
    }

    @Post(':id/ttn')
    @ApiOperation({
        summary: 'Создать ТТН Nova Poshta для заказа',
        description: 'Требует заполненных реквизитов отправителя NP в настройках. Сохраняет trackingNumber.',
    })
    @ApiResponse({ status: 201, description: 'ТТН создана, trackingNumber сохранён.' })
    @ApiResponse({ status: 400, description: 'Не настроен отправитель NP или нет данных доставки.' })
    createTtn(@Param('id', ParseIntPipe) id: number) {
        return this.orderService.createTtn(id);
    }
}