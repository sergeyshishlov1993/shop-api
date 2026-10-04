import { Injectable } from '@nestjs/common';
import {
  FeedbackStatus,
  OrderStatus,
  ReturnStatus,
  ReviewStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DashboardCountersQueryDto } from './dto/dashboard-counters-query.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekStart = new Date(todayStart);
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const previousWeek = new Date(weekStart);
    previousWeek.setDate(previousWeek.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      today,
      week,
      previousWeekMetrics,
      month,
      previousMonthMetrics,
      newOrders,
      pendingReviews,
      newFeedback,
      lowStockVariants,
      topProducts,
      recentOrders,
      monthExpenses,
      orderStatuses,
    ] = await Promise.all([
      this.getPeriodMetrics(todayStart, tomorrow),
      this.getPeriodMetrics(weekStart, nextWeek),
      this.getPeriodMetrics(previousWeek, weekStart),
      this.getPeriodMetrics(monthStart, nextMonth),
      this.getPeriodMetrics(previousMonth, monthStart),
      this.prisma.order.count({ where: { status: OrderStatus.NEW, archivedAt: null } }),
      this.prisma.review.count({ where: { status: ReviewStatus.PENDING } }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.NEW, deletedAt: null } }),
      this.countLowStockVariants(),
      this.prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: {
            status: OrderStatus.DELIVERED,
            archivedAt: null,
            createdAt: { gte: weekStart, lt: nextWeek },
          },
        },
        _sum: { quantity: true, lineRevenue: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      this.prisma.order.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: monthStart, lt: nextMonth } },
        _sum: { amount: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { archivedAt: null },
        _count: { _all: true },
      }),
    ]);

    const expenses = monthExpenses._sum.amount ?? 0;

    return {
      today,
      week: {
        ...week,
        changePercent: this.getChangePercent(week.revenue, previousWeekMetrics.revenue),
      },
      month: {
        ...month,
        changePercent: this.getChangePercent(month.revenue, previousMonthMetrics.revenue),
      },
      financials: {
        revenue: month.revenue,
        costOfGoods: month.costOfGoods,
        grossProfit: month.grossProfit,
        expenses: this.round(expenses),
        netProfit: this.round(month.grossProfit - expenses),
      },
      pendingActions: {
        newOrders,
        pendingReviews,
        newFeedback,
        lowStockVariants,
      },
      orderStatuses: Object.fromEntries(
        orderStatuses.map((item) => [item.status, item._count._all]),
      ),
      topProducts: topProducts.map((item) => ({
        productName: item.productName,
        quantity: item._sum.quantity ?? 0,
        revenue: this.round(item._sum.lineRevenue ?? 0),
      })),
      recentOrders,
    };
  }

  /**
   * Лічильники «потребує уваги» для меню адмінки — одним запитом.
   * Замовлення/звернення/повернення — за статусом «нове»; відгуки й користувачі — створені після мітки
   * «востаннє переглянуто» розділ (відповіді самих адмінів не рахуються).
   */
  async getCounters(query: DashboardCountersQueryDto) {
    const after = (iso?: string) => (iso ? { gt: new Date(iso) } : undefined);
    const [newOrders, newReviews, newFeedback, newReturns, newUsers, lowStockVariants] = await Promise.all([
      this.prisma.order.count({ where: { status: OrderStatus.NEW, archivedAt: null } }),
      this.prisma.review.count({ where: { createdAt: after(query.reviewsSince), user: { role: { not: UserRole.ADMIN } } } }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.NEW, deletedAt: null } }),
      this.prisma.returnRequest.count({ where: { status: ReturnStatus.NEW } }),
      this.prisma.user.count({ where: { createdAt: after(query.usersSince), role: { not: UserRole.ADMIN } } }),
      this.countLowStockVariants(),
    ]);
    return { newOrders, newReviews, newFeedback, newReturns, newUsers, lowStockVariants };
  }

  private async countLowStockVariants() {
    const [settings, variants] = await Promise.all([
      this.prisma.storeSettings.findFirst({ select: { defaultLowStockThreshold: true } }),
      this.prisma.productVariant.findMany({
        where: { isActive: true, deletedAt: null, product: { deletedAt: null } },
        select: { stockQty: true, reservedQty: true },
      }),
    ]);
    const threshold = settings?.defaultLowStockThreshold ?? 3;
    return variants.filter((variant) => variant.stockQty - variant.reservedQty <= threshold).length;
  }

  private async getPeriodMetrics(dateFrom: Date, dateTo: Date) {
    const [ordersCount, delivered] = await Promise.all([
      this.prisma.order.count({
        where: { archivedAt: null, createdAt: { gte: dateFrom, lt: dateTo } },
      }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.DELIVERED,
          archivedAt: null,
          createdAt: { gte: dateFrom, lt: dateTo },
        },
        _count: { _all: true },
        _sum: { totalAmount: true, totalCost: true, grossProfit: true },
      }),
    ]);

    const revenue = delivered._sum.totalAmount ?? 0;
    const deliveredCount = delivered._count._all;

    return {
      ordersCount,
      deliveredCount,
      revenue: this.round(revenue),
      costOfGoods: this.round(delivered._sum.totalCost ?? 0),
      grossProfit: this.round(delivered._sum.grossProfit ?? 0),
      averageCheck: deliveredCount ? this.round(revenue / deliveredCount) : 0,
    };
  }

  private getChangePercent(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return this.round(((current - previous) / previous) * 100);
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }
}
