import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueryReportDto } from './dto/query-report.dto';
import { OrderStatus, Prisma } from '@prisma/client';

const r2 = (value: number) => Math.round(value * 100) / 100;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  // Замовлення періоду з урахуванням фільтрів (статуси, тип/категорія/товар) — спільна база для всіх звітів.
  private async loadOrders(query: QueryReportDto) {
    const {
      dateFrom,
      dateTo,
      orderStatuses = [OrderStatus.DELIVERED],
      productType,
      categoryId,
      productId,
    } = query;

    const dateFromParsed = new Date(dateFrom);
    const dateToParsed = new Date(dateTo);

    const orderItemWhere: Prisma.OrderItemWhereInput = {};
    const hasItemFilters = !!(productType || categoryId || productId);

    if (productType) {
      orderItemWhere.productType = productType;
    }

    if (categoryId || productId) {
      orderItemWhere.productVariant = {
        product: {
          ...(categoryId ? { categoryId } : {}),
          ...(productId ? { id: productId } : {}),
        },
      };
    }

    const orders = await this.prisma.order.findMany({
      where: { status: { in: orderStatuses }, createdAt: { gte: dateFromParsed, lte: dateToParsed } },
      include: {
        items: {
          ...(hasItemFilters ? { where: orderItemWhere } : {}),
          include: {
            productVariant: { select: { product: { select: { id: true, categoryId: true, category: { select: { name: true } } } } } },
          },
        },
      },
    });

    const filteredOrders = hasItemFilters
      ? orders.filter((order) => order.items.length > 0)
      : orders;

    return { filteredOrders, dateFromParsed, dateToParsed };
  }

  async getReport(query: QueryReportDto) {
    const { filteredOrders, dateFromParsed, dateToParsed } = await this.loadOrders(query);

    let revenue = 0;
    let costOfGoods = 0;
    const productAggregation = new Map<
      string,
      { productName: string; revenue: number; quantity: number }
    >();

    for (const order of filteredOrders) {
      for (const item of order.items) {
        revenue += item.lineRevenue;
        costOfGoods += item.lineCost;

        const existing = productAggregation.get(item.productName);
        if (existing) {
          existing.revenue += item.lineRevenue;
          existing.quantity += item.quantity;
        } else {
          productAggregation.set(item.productName, {
            productName: item.productName,
            revenue: item.lineRevenue,
            quantity: item.quantity,
          });
        }
      }
    }

    const grossProfit = revenue - costOfGoods;

    const expensesAggregate = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        expenseDate: { gte: dateFromParsed, lte: dateToParsed },
      },
    });

    const expenses = expensesAggregate._sum.amount ?? 0;
    const netProfit = grossProfit - expenses;

    const ordersCount = filteredOrders.length;
    const topProducts = Array.from(productAggregation.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      revenue: r2(revenue),
      costOfGoods: r2(costOfGoods),
      grossProfit: r2(grossProfit),
      expenses: r2(expenses),
      netProfit: r2(netProfit),
      ordersCount,
      averageOrderValue: ordersCount > 0 ? r2(revenue / ordersCount) : 0,
      topProducts: topProducts.map((product) => ({
        productName: product.productName,
        revenue: r2(product.revenue),
        quantity: product.quantity,
      })),
    };
  }

  // [{ date, revenue, cost, grossProfit, expenses, netProfit, ordersCount }] — кожен день періоду, порожні дні з нулями.
  async getByDay(query: QueryReportDto) {
    const { filteredOrders, dateFromParsed, dateToParsed } = await this.loadOrders(query);
    const days = new Map<string, { revenue: number; cost: number; expenses: number; ordersCount: number }>();

    // ponytail: обмеження 366 днів, щоб випадковий великий діапазон не згенерував гігантську відповідь
    const cursor = new Date(Date.UTC(dateFromParsed.getUTCFullYear(), dateFromParsed.getUTCMonth(), dateFromParsed.getUTCDate()));
    while (cursor <= dateToParsed && days.size < 366) {
      days.set(dayKey(cursor), { revenue: 0, cost: 0, expenses: 0, ordersCount: 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    for (const order of filteredOrders) {
      const day = days.get(dayKey(order.createdAt));
      if (!day) continue;
      day.ordersCount += 1;
      for (const item of order.items) {
        day.revenue += item.lineRevenue;
        day.cost += item.lineCost;
      }
    }

    const expenses = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: dateFromParsed, lte: dateToParsed } },
      select: { amount: true, expenseDate: true },
    });
    for (const expense of expenses) {
      const day = days.get(dayKey(expense.expenseDate));
      if (day) day.expenses += expense.amount;
    }

    return Array.from(days, ([date, d]) => ({
      date,
      revenue: r2(d.revenue),
      cost: r2(d.cost),
      grossProfit: r2(d.revenue - d.cost),
      expenses: r2(d.expenses),
      netProfit: r2(d.revenue - d.cost - d.expenses),
      ordersCount: d.ordersCount,
    }));
  }

  // [{ categoryId, categoryName, revenue, cost, grossProfit, ordersCount, itemsSold }] — зі снепшотів OrderItem.
  async getByCategory(query: QueryReportDto) {
    const { filteredOrders } = await this.loadOrders(query);
    const groups = new Map<string, { categoryId: number | null; categoryName: string; revenue: number; cost: number; orders: Set<number>; itemsSold: number }>();

    for (const order of filteredOrders) {
      for (const item of order.items) {
        // Снепшот назви категорії; якщо його немає (старі/тестові замовлення) — поточна категорія товару
        const categoryName = item.categoryName ?? item.productVariant?.product.category?.name ?? 'Без категорії';
        const group = groups.get(categoryName) ?? {
          categoryId: item.productVariant?.product.categoryId ?? null,
          categoryName,
          revenue: 0,
          cost: 0,
          orders: new Set<number>(),
          itemsSold: 0,
        };
        group.revenue += item.lineRevenue;
        group.cost += item.lineCost;
        group.orders.add(order.id);
        group.itemsSold += item.quantity;
        groups.set(categoryName, group);
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((g) => ({
        categoryId: g.categoryId,
        categoryName: g.categoryName,
        revenue: r2(g.revenue),
        cost: r2(g.cost),
        grossProfit: r2(g.revenue - g.cost),
        ordersCount: g.orders.size,
        itemsSold: g.itemsSold,
      }));
  }

  // [{ productId, productName, sku, revenue, cost, grossProfit, itemsSold, marginPercent }] — revenue DESC.
  async getByProduct(query: QueryReportDto) {
    const { filteredOrders } = await this.loadOrders(query);
    const groups = new Map<string, { productId: number | null; productName: string; sku: string; revenue: number; cost: number; itemsSold: number }>();

    for (const order of filteredOrders) {
      for (const item of order.items) {
        const productId = item.productVariant?.product.id ?? null;
        const key = productId ? `id:${productId}` : `name:${item.productName}`;
        const group = groups.get(key) ?? { productId, productName: item.productName, sku: item.sku, revenue: 0, cost: 0, itemsSold: 0 };
        group.revenue += item.lineRevenue;
        group.cost += item.lineCost;
        group.itemsSold += item.quantity;
        groups.set(key, group);
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((g) => ({
        productId: g.productId,
        productName: g.productName,
        sku: g.sku,
        revenue: r2(g.revenue),
        cost: r2(g.cost),
        grossProfit: r2(g.revenue - g.cost),
        itemsSold: g.itemsSold,
        marginPercent: g.revenue > 0 ? r2(((g.revenue - g.cost) / g.revenue) * 100) : 0,
      }));
  }

  // [{ category, totalAmount, count }] — витрати періоду по типах.
  async getExpensesByCategory(query: QueryReportDto) {
    const grouped = await this.prisma.expense.groupBy({
      by: ['type'],
      where: { expenseDate: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return grouped
      .map((g) => ({ category: g.type, totalAmount: r2(g._sum.amount ?? 0), count: g._count._all }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }
}
