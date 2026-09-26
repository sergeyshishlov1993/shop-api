import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreatePaymentResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './providers/payment-provider.interface';

const SETTINGS_SINGLETON_ID = 1;

/**
 * Оплата (шаг 0.1) — инфраструктура построена, но скрыта фиче-флагом.
 *
 * Гейт двойной:
 *  - env `PAYMENTS_ENABLED` — хард-переключатель окружения;
 *  - `StoreSettings.onlinePaymentEnabled` — мягкий тумблер для админа.
 * Online-оплата доступна, только если истинны оба. По умолчанию — выключено.
 *
 * Пока флаг выключен, `POST /storefront/payments` отдаёт 403.
 * Когда флаг включат, но реальный провайдер ещё не подключён, вызовы упрутся
 * в NotImplementedException из StubPaymentProvider — это ожидаемо на 0.1.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Включена ли online-оплата (env-гейт И тумблер настроек). */
  async isOnlinePaymentEnabled(): Promise<boolean> {
    if (this.config.get<string>('PAYMENTS_ENABLED') !== 'true') return false;
    const settings = await this.prisma.storeSettings.findUnique({
      where: { id: SETTINGS_SINGLETON_ID },
      select: { onlinePaymentEnabled: true },
    });
    return Boolean(settings?.onlinePaymentEnabled);
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.isOnlinePaymentEnabled())) {
      throw new ForbiddenException('Онлайн-оплата временно недоступна.');
    }
  }

  /**
   * Создать онлайн-платёж по заказу и вернуть ссылку на оплату.
   * TODO(payment): дореализовать после подключения реального провайдера.
   */
  async createPaymentForOrder(
    orderId: number,
    userId: number | null,
  ): Promise<CreatePaymentResult> {
    await this.assertEnabled();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        customerEmail: true,
        totalAmount: true,
        paymentStatus: true,
      },
    });
    if (!order) throw new NotFoundException('Заказ не найден.');
    // Гость создаёт платёж по своему заказу; авторизованный — только по своему.
    if (order.userId !== null && order.userId !== userId) {
      throw new ForbiddenException('Нет доступа к этому заказу.');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Заказ уже оплачен.');
    }

    const currency =
      (
        await this.prisma.storeSettings.findUnique({
          where: { id: SETTINGS_SINGLETON_ID },
          select: { currency: true },
        })
      )?.currency ?? 'UAH';

    // Заглушка бросит NotImplementedException — это ожидаемо на 0.1.
    const result = await this.provider.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      currency,
      description: `Оплата заказа ${order.orderNumber}`,
      customerEmail: order.customerEmail,
    });

    // TODO(payment): выполнить после реального создания платежа у провайдера.
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: PaymentStatus.PENDING,
        paymentProvider: this.provider.name,
        paymentId: result.paymentId,
      },
    });

    return result;
  }

  /**
   * Обработать вебхук провайдера: проверить подпись, идемпотентно обновить статус.
   * TODO(payment): дореализовать после подключения реального провайдера.
   */
  async handleProviderCallback(
    payload: unknown,
    signature?: string,
  ): Promise<{ received: true }> {
    // Заглушка бросит NotImplementedException — это ожидаемо на 0.1.
    const parsed = await this.provider.verifyAndParseCallback(payload, signature);

    const order = await this.prisma.order.findFirst({
      where: { paymentId: parsed.paymentId },
      select: { id: true, paymentStatus: true },
    });
    if (!order) {
      // Не роняем вебхук 500-кой — просто логируем неизвестный платёж.
      this.logger.warn(`Callback for unknown paymentId=${parsed.paymentId}`);
      return { received: true };
    }

    // Идемпотентность: не переоткрываем уже финализированный платёж.
    if (order.paymentStatus === PaymentStatus.PAID) return { received: true };

    // Провайдерские статусы совпадают по именам с PaymentStatus — маппим напрямую.
    const nextStatus = PaymentStatus[parsed.status];

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: nextStatus,
        paidAt: nextStatus === PaymentStatus.PAID ? new Date() : undefined,
      },
    });

    // TODO(payment): при PAID — триггер письма-подтверждения (0.3) и перевода статуса заказа.
    return { received: true };
  }

  /**
   * Возврат средств по оплаченному заказу.
   * TODO(payment): дореализовать после подключения реального провайдера.
   */
  async refundOrder(orderId: number): Promise<void> {
    await this.assertEnabled();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, paymentId: true, paymentStatus: true, totalAmount: true },
    });
    if (!order) throw new NotFoundException('Заказ не найден.');
    if (order.paymentStatus !== PaymentStatus.PAID || !order.paymentId) {
      throw new BadRequestException('Заказ не оплачен онлайн — возврат недоступен.');
    }

    // Заглушка бросит NotImplementedException — это ожидаемо на 0.1.
    await this.provider.refund(order.paymentId, order.totalAmount);

    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
  }
}
