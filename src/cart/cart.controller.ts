import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AddCartItemDto, UpdateCartItemDto } from './dto';
import { CartSessionId } from './decorators/cart-session-id.decorator';
import { CartService } from './cart.service';

@ApiTags('Storefront — Корзина')
@Controller('storefront/cart')
@UseGuards(OptionalJwtAuthGuard)
@ApiBearerAuth('bearer')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get('_owner')
  @ApiExcludeEndpoint()
  getCartOwner(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @CartSessionId() sessionId: string | null,
  ) {
    const ownerInput = this.resolveOwner(req, sessionId);
    return this.cartService.resolveCartOwner(ownerInput);
  }

  @Get('_debug')
  @ApiExcludeEndpoint()
  getDebug(
    @Req() req: Request & {
      user?: { sub?: number; id?: number; email?: string; role?: string };
    },
    @CartSessionId() sessionId: string | null,
  ) {
    return {
      cookiesSessionId: sessionId,
      user: req.user ?? null,
      ownerInput: this.resolveOwner(req, sessionId),
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Получить корзину',
    description: `**Доступ:** публичный (гость по sessionId) или авторизованный (JWT)

**Зачем:** отображение корзины — список товаров, количество, цены, итого.

**Идентификация корзины:**
- Авторизованный пользователь → корзина по \`userId\`
- Гость → корзина по \`cartSessionId\` из cookie (UUID, устанавливается фронтендом)

**Ответ:** items[] с данными:
- variant: productName, sku, size (name), color (name, hexCode), main media URL
- unitPriceSnapshot — актуальная цена варианта (обновляется при каждом запросе)
- quantity, lineTotal (qty × price)
- availabilityStatus: IN_STOCK / LOW_STOCK / OUT_OF_STOCK (если остаток изменился)

Товары с \`availableQty = 0\` остаются в корзине со статусом OUT_OF_STOCK — покупатель сам решает удалить или подождать.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Корзина с актуальными ценами и статусами.',
  })
  getCart(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @CartSessionId() sessionId: string | null,
  ) {
    const owner = this.cartService.resolveCartOwner(this.resolveOwner(req, sessionId));
    return this.cartService.getCart(owner);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Добавить товар в корзину',
    description: `**Доступ:** публичный (гость) или авторизованный (JWT)

**Бизнес-логика:**
1. Проверяется что вариант существует, активен, не удалён
2. Проверяется \`availableQty\` (stockQty - reservedQty) ≥ requested quantity
3. Если вариант уже в корзине — quantity увеличивается (не заменяется)
4. \`unitPriceSnapshot\` записывается/обновляется по текущей цене варианта
5. Если корзины ещё нет — создаётся

**Поля:**
- \`variantId\` — id варианта товара (ProductVariant)
- \`quantity\` — количество (мин 1)`,
  })
  @ApiResponse({
    status: 201,
    description: 'Товар добавлен в корзину.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации, недостаточный остаток или вариант недоступен.',
  })
  @ApiResponse({
    status: 404,
    description: 'Вариант не найден.',
  })
  addItem(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @CartSessionId() sessionId: string | null,
    @Body() dto: AddCartItemDto,
  ) {
    const owner = this.cartService.resolveCartOwner(this.resolveOwner(req, sessionId));
    return this.cartService.addItem(owner, dto);
  }

  @Patch('items/:id')
  @ApiOperation({
    summary: 'Изменить количество товара',
    description: `**Доступ:** публичный (гость) или авторизованный (JWT)

**Бизнес-логика:**
- Проверяется \`availableQty\` ≥ новое quantity
- Если \`quantity = 0\` → позиция удаляется из корзины
- \`unitPriceSnapshot\` обновляется по текущей цене`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор элемента корзины (CartItem.id)',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Количество обновлено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Недостаточный остаток или ошибка валидации.',
  })
  @ApiResponse({
    status: 404,
    description: 'Элемент корзины не найден.',
  })
  updateItem(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @CartSessionId() sessionId: string | null,
    @Param('id', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    const owner = this.cartService.resolveCartOwner(this.resolveOwner(req, sessionId));
    return this.cartService.updateItem(owner, itemId, dto);
  }

  @Delete('items/:id')
  @ApiOperation({
    summary: 'Удалить товар из корзины',
    description: `**Доступ:** публичный (гость) или авторизованный (JWT)

**Бизнес-логика:** физическое удаление CartItem. Проверяется что элемент принадлежит корзине текущего пользователя/сессии.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор элемента корзины (CartItem.id)',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Товар удалён из корзины.',
  })
  @ApiResponse({
    status: 404,
    description: 'Элемент корзины не найден.',
  })
  removeItem(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @CartSessionId() sessionId: string | null,
    @Param('id', ParseIntPipe) itemId: number,
  ) {
    const owner = this.cartService.resolveCartOwner(this.resolveOwner(req, sessionId));
    return this.cartService.removeItem(owner, itemId);
  }

  private resolveOwner(
    req: Request & { user?: { sub?: number; id?: number } },
    sessionId: string | null,
  ) {
    const userId =
      typeof req.user?.id === 'number'
        ? req.user.id
        : typeof req.user?.sub === 'number'
          ? req.user.sub
          : null;

    return {
      userId,
      sessionId,
    };
  }
}
