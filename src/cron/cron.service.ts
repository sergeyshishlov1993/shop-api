import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderService: OrderService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncNovaPoshtaOrderStatuses(): Promise<void> {
    await this.orderService.syncNovaPoshtaStatuses();
  }

  // Брошенные гостевые заказы держат резерв склада — отменяем через 72ч (резерв снимает updateOrderStatus)
  @Cron(CronExpression.EVERY_HOUR)
  async cancelStaleGuestOrders(): Promise<void> {
    const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const stale = await this.prismaService.order.findMany({
      where: { userId: null, status: OrderStatus.NEW, createdAt: { lt: threshold } },
      select: { id: true },
    });

    for (const { id } of stale) {
      try {
        await this.orderService.updateOrderStatus(id, {
          newStatus: OrderStatus.CANCELLED,
          note: 'Автоскасування: не підтверджено за 72 год',
        });
      } catch (e) {
        this.logger.error(`Auto-cancel order ${id} failed`, e instanceof Error ? e.stack : String(e));
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupGuestCarts(): Promise<void> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 30);

    await this.prismaService.cart.deleteMany({
      where: {
        userId: null,
        updatedAt: {
          lt: thresholdDate,
        },
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    await this.prismaService.passwordResetToken.deleteMany({
      where: {
        OR: [
          {
            expiresAt: {
              lt: new Date(),
            },
          },
          {
            usedAt: {
              not: null,
            },
          },
        ],
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldRevokedRefreshSessions(): Promise<void> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 30);

    await this.prismaService.refreshSession.deleteMany({
      where: {
        revokedAt: {
          not: null,
          lt: thresholdDate,
        },
      },
    });
  }
}
