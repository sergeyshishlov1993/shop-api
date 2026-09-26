import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { Public } from '../common/decorators';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Storefront — Оплата')
@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('storefront/payments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Создать онлайн-платёж по заказу',
    description:
      'За фиче-флагом. Пока онлайн-оплата выключена (env `PAYMENTS_ENABLED` + ' +
      '`StoreSettings.onlinePaymentEnabled`), возвращает 403.',
  })
  @ApiResponse({ status: 201, description: 'Платёж создан, возвращён redirectUrl.' })
  @ApiResponse({ status: 403, description: 'Онлайн-оплата временно недоступна (флаг выключен).' })
  async createPayment(
    @Req() req: Request & { user?: { sub?: number; id?: number } },
    @Body() dto: CreatePaymentDto,
  ) {
    const userId =
      typeof req.user?.id === 'number'
        ? req.user.id
        : typeof req.user?.sub === 'number'
          ? req.user.sub
          : null;

    return this.paymentService.createPaymentForOrder(dto.orderId, userId);
  }

  @Public()
  @Post('payments/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вебхук провайдера оплаты',
    description:
      'За фиче-флагом. Проверяет подпись и идемпотентно обновляет статус оплаты заказа.',
  })
  @ApiResponse({ status: 200, description: 'Вебхук принят.' })
  async callback(
    @Body() payload: unknown,
    @Headers('x-signature') signature?: string,
  ) {
    return this.paymentService.handleProviderCallback(payload, signature);
  }
}
