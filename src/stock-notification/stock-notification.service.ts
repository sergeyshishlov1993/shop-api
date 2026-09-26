import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class StockNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(productId: number, email: string, userId: number | null) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Товар не знайдено.');

    const existing = await this.prisma.stockNotification.findFirst({
      where: { productId, email, notifiedAt: null },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.stockNotification.create({ data: { productId, email, userId } });
    }
    return { subscribed: true };
  }

  /**
   * Вызывается после пополнения остатка. Если у товара появились доступные
   * варианты — рассылаем ожидающим подписчикам и помечаем notifiedAt.
   * Не-фатально: доставку писем глотает EmailService.
   */
  async notifyBackInStock(productId: number): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM "ProductVariant"
      WHERE "productId" = ${productId} AND "isActive" = true AND "deletedAt" IS NULL
        AND ("stockQty" - "reservedQty") > 0
    `;
    if (!rows[0]?.c) return;

    const pending = await this.prisma.stockNotification.findMany({
      where: { productId, notifiedAt: null },
      select: { email: true },
    });
    if (pending.length === 0) return;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, slug: true },
    });
    if (!product) return;

    for (const sub of pending) {
      await this.emailService.sendBackInStockEmail({
        email: sub.email,
        productName: product.name,
        slug: product.slug,
      });
    }

    await this.prisma.stockNotification.updateMany({
      where: { productId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
  }
}
