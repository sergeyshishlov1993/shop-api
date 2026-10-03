import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { StockNotificationService } from './stock-notification.service';
import { SubscribeStockDto } from './dto/subscribe-stock.dto';

@ApiTags('Storefront — Підписка на наявність')
@Controller('storefront/stock-notifications')
export class StockNotificationController {
  constructor(private readonly service: StockNotificationService) {}

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Підписатися на сповіщення про надходження товару' })
  subscribe(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @Body() dto: SubscribeStockDto,
  ) {
    const userId =
      typeof req.user?.id === 'number'
        ? req.user.id
        : typeof req.user?.sub === 'number'
          ? req.user.sub
          : null;
    return this.service.subscribe(dto.productId, dto.email, userId);
  }
}
