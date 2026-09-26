import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { StubPaymentProvider } from './providers/stub-payment.provider';

/**
 * Оплата (шаг 0.1). Провайдер внедряется через токен PAYMENT_PROVIDER —
 * реальный эквайринг (WayForPay / LiqPay / Mono) заменит StubPaymentProvider
 * одной строкой, без правок сервиса/контроллера.
 */
@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    { provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
