import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentCallbackResult,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Заглушка провайдера оплаты (шаг 0.1).
 *
 * Держит форму контракта, но не выполняет реальных вызовов эквайринга.
 * Реальный провайдер (WayForPay / LiqPay / Mono) заменит эту реализацию
 * отдельным подшагом. Пока online-оплата в любом случае скрыта фиче-флагом,
 * поэтому эти методы в проде не вызываются.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly name = 'stub';

  createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // TODO(payment): реализовать создание платежа у выбранного провайдера.
    throw new NotImplementedException('Payment provider is not configured yet (0.1 scaffolding).');
  }

  verifyAndParseCallback(_payload: unknown, _signature?: string): Promise<PaymentCallbackResult> {
    // TODO(payment): проверить подпись и распарсить вебхук провайдера.
    throw new NotImplementedException('Payment provider is not configured yet (0.1 scaffolding).');
  }

  refund(_paymentId: string, _amount: number): Promise<void> {
    // TODO(payment): реализовать возврат средств у провайдера.
    throw new NotImplementedException('Payment provider is not configured yet (0.1 scaffolding).');
  }
}
