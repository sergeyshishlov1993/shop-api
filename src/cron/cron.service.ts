import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class CronService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderService: OrderService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncNovaPoshtaOrderStatuses(): Promise<void> {
    await this.orderService.syncNovaPoshtaStatuses();
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
