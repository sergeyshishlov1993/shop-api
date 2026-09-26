// Провайдер-агностичный контракт эквайринга.
// Конкретная реализация (WayForPay / LiqPay / Mono) подключается отдельным
// подшагом 0.1 — сейчас в проекте только заглушка StubPaymentProvider.

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentInput {
  orderId: number;
  orderNumber: string;
  /** Сумма к оплате в валюте заказа (например, 1499.00). */
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string | null;
}

export interface CreatePaymentResult {
  /** Идентификатор платежа на стороне провайдера. */
  paymentId: string;
  /** URL, куда редиректим покупателя для оплаты. */
  redirectUrl: string;
}

export type ProviderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentCallbackResult {
  paymentId: string;
  status: ProviderPaymentStatus;
  /** Сырой распарсенный payload — для аудита/логов. */
  raw: unknown;
}

export interface PaymentProvider {
  /** Человекочитаемое имя провайдера (пишется в Order.paymentProvider). */
  readonly name: string;

  /** Создать платёж и получить ссылку для оплаты. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Проверить подпись вебхука и распарсить его в унифицированный результат.
   * Бросает, если подпись невалидна.
   */
  verifyAndParseCallback(payload: unknown, signature?: string): Promise<PaymentCallbackResult>;

  /** Полный или частичный возврат по платежу провайдера. */
  refund(paymentId: string, amount: number): Promise<void>;
}
