import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@ApiTags('Storefront — Заказы')
@Controller('storefront/orders')
@UseGuards(OptionalJwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Оформить заказ',
    description: `**Доступ:** публичный (гость) или авторизованный (JWT)

**Зачем:** оформление заказа из корзины. Центральная бизнес-операция магазина.

**Идемпотентность:** заголовок \`x-idempotency-key\` (UUID) предотвращает повторное создание заказа при ретрае. Если заказ с таким ключом уже существует — возвращается 200 с существующим заказом.

**Бизнес-логика:**
1. Проверяется идемпотентность (если ключ передан)
2. Получается корзина (по userId или sessionId)
3. Для каждого CartItem:
   - Проверяется вариант: существует, активен, не удалён
   - Проверяется остаток: \`availableQty ≥ quantity\`
   - Если нет — ошибка 400 с указанием проблемных позиций
4. Создаётся Order:
   - \`orderNumber\`: ORD-YYYYMMDD-00001 (автоинкремент за день)
   - \`status\`: NEW
   - Финансы: subtotal, discount (personalDiscountPercent пользователя), deliveryAmount, totalAmount, totalCost, grossProfit, netProfit
5. Создаются OrderItems со **снепшотами**: productName, category, type, sku, size, color, salePrice, purchaseCost, qty, lineRevenue/Cost/Profit
6. \`reservedQty\` вариантов увеличивается на заказанное количество
7. OrderStatusHistory: null → NEW
8. Корзина очищается
9. Telegram уведомление админу

**Данные доставки:** передаются в теле (\`customerName\`, \`customerPhone\`, \`customerEmail\`, \`deliveryProvider\`, \`city\`, \`warehouse\` и т.д.) ИЛИ \`deliveryProfileId\` — данные копируются из сохранённого профиля.

**Скидка:** если пользователь авторизован и имеет \`personalDiscountPercent\` > 0, скидка применяется автоматически.`,
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'UUID для защиты от повторного создания заказа при ретрае',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: 201,
    description: 'Заказ создан, корзина очищена, Telegram уведомление отправлено.',
  })
  @ApiResponse({
    status: 200,
    description: 'Возвращён ранее созданный заказ (идемпотентный повтор).',
  })
  @ApiResponse({
    status: 400,
    description: 'Корзина пуста, недостаточный остаток или ошибка валидации.',
  })
  async createOrder(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @Res({ passthrough: true }) res: Response,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    const userId =
      typeof req.user?.id === 'number'
        ? req.user.id
        : typeof req.user?.sub === 'number'
          ? req.user.sub
          : null;

    const sessionId =
      typeof req.cookies?.cartSessionId === 'string' && req.cookies.cartSessionId.length > 0
        ? req.cookies.cartSessionId
        : null;

    const result = await this.orderService.createOrder(
      {
        userId,
        sessionId,
      },
      dto,
      idempotencyKey ?? null,
    );

    if (result.isIdempotentReplay) {
      res.status(HttpStatus.OK);
    }

    return result.order;
  }

  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard)
  @SwaggerJwtAuth()
  @ApiOperation({
    summary: 'Получить информацию о доставке',
    description: 'Возвращает данные трекинга из API службы доставки',
  })
  @ApiResponse({
    status: 200,
    description: 'Информация о доставке',
  })
  @ApiResponse({
    status: 404,
    description: 'Заказ не найден',
  })
  async getOrderTracking(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.orderService.getOrderTracking(id, userId);
  }
}
