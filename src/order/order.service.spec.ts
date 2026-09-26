import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let prisma: any;
  let tx: any;
  let coupon: any;
  let telegram: any;
  let email: any;
  let cache: any;
  let service: OrderService;

  const owner = { userId: 1, sessionId: null };
  const dto: any = {
    customerName: 'Ivan',
    customerPhone: '+380',
    deliveryProvider: 'NOVA_POSHTA',
    city: 'Kyiv',
    warehouse: '1',
  };

  const cartItem = (over: any = {}, qty = 2) => ({
    quantity: qty,
    productVariant: {
      id: 5,
      sku: 'SKU5',
      price: null,
      stockQty: 10,
      reservedQty: 0,
      isActive: true,
      deletedAt: null,
      size: null,
      color: null,
      product: {
        name: 'Shirt',
        basePrice: 100,
        purchaseCost: 40,
        productType: 'CLOTHING',
        isActive: true,
        deletedAt: null,
        category: { name: 'Tops' },
      },
      ...over,
    },
  });

  beforeEach(() => {
    tx = {
      order: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ id: 100, ...data })),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      cartItem: { deleteMany: jest.fn() },
      productVariant: { update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
      cart: { findFirst: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 1, personalDiscountPercent: 0 }) },
      storeSettings: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg))),
    };
    coupon = { validate: jest.fn(), redeem: jest.fn() };
    telegram = {
      sendOrderNotification: jest.fn(),
      sendStatusChangeNotification: jest.fn(),
      sendLowStockNotification: jest.fn(),
    };
    email = { sendOrderConfirmationEmail: jest.fn(), sendOrderStatusEmail: jest.fn() };
    cache = { invalidateProduct: jest.fn(), invalidateRelated: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('https://shop.test/') };
    service = new OrderService(prisma, telegram, config as any, cache, {} as any, email, coupon);
  });

  describe('createOrder', () => {
    it('requires owner', async () => {
      await expect(service.createOrder({ userId: null, sessionId: null }, dto, 'k')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('requires idempotency key', async () => {
      await expect(service.createOrder(owner, dto, null)).rejects.toThrow('X-Idempotency-Key');
    });

    it('replays existing order for reused idempotency key', async () => {
      const existing = { id: 7, userId: 1 };
      prisma.order.findUnique.mockResolvedValue(existing);
      await expect(service.createOrder(owner, dto, 'k')).resolves.toEqual({ order: existing, isIdempotentReplay: true });
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects reused idempotency key of another user', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 7, userId: 2 });
      await expect(service.createOrder(owner, dto, 'k')).rejects.toThrow('Idempotency key already used');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects reused idempotency key of a user order for a guest', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 7, userId: 1 });
      await expect(service.createOrder({ userId: null, sessionId: 's1' }, dto, 'k')).rejects.toThrow('Idempotency key already used');
    });

    it('rejects empty cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [] });
      await expect(service.createOrder(owner, dto, 'k')).rejects.toThrow('Cart is empty');
    });

    it('rejects when quantity exceeds available stock', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem({ stockQty: 5, reservedQty: 4 }, 2)] });
      await expect(service.createOrder(owner, dto, 'k')).rejects.toThrow('Insufficient stock');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects unavailable variant', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem({ isActive: false })] });
      await expect(service.createOrder(owner, dto, 'k')).rejects.toThrow('unavailable');
    });

    it('rejects Nova Poshta delivery without warehouse', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem()] });
      await expect(service.createOrder(owner, { ...dto, warehouse: undefined }, 'k')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('computes totals, reserves stock, clears cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem({ price: 150 }, 2)] });

      const { order, isIdempotentReplay } = await service.createOrder(owner, dto, 'k1');

      expect(isIdempotentReplay).toBe(false);
      expect(order).toMatchObject({
        subtotal: 300,
        discountAmount: 0,
        deliveryAmount: 0,
        totalAmount: 300,
        totalCost: 80,
        grossProfit: 220,
        netProfit: 220,
        status: OrderStatus.NEW,
        idempotencyKey: 'k1',
        couponCode: null,
      });
      expect(order.orderNumber).toMatch(/^ORD-\d{8}-00001$/);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual([2, 5, 2]);
      expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 1 } });
      expect(coupon.redeem).not.toHaveBeenCalled();
      expect(cache.invalidateProduct).toHaveBeenCalled();
      expect(telegram.sendOrderNotification).toHaveBeenCalledWith(
        expect.objectContaining({ adminLink: 'https://shop.test/admin/orders/100', delivery: 'NOVA_POSHTA, Kyiv, 1' }),
      );
    });

    it('applies personal discount and coupon, redeems coupon in transaction', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem({}, 2)] });
      prisma.user.findUnique.mockResolvedValue({ id: 1, personalDiscountPercent: 5 });
      coupon.validate.mockResolvedValue({ code: 'SALE', discountAmount: 30 });

      const { order } = await service.createOrder(owner, { ...dto, couponCode: 'sale' }, 'k');

      expect(coupon.validate).toHaveBeenCalledWith('sale', 200);
      expect(order).toMatchObject({ subtotal: 200, discountAmount: 40, totalAmount: 160, netProfit: 80, couponCode: 'SALE' });
      expect(coupon.redeem).toHaveBeenCalledWith(tx, 'SALE');
    });

    it('caps combined discount at subtotal', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem({}, 1)] });
      prisma.user.findUnique.mockResolvedValue({ id: 1, personalDiscountPercent: 50 });
      coupon.validate.mockResolvedValue({ code: 'BIG', discountAmount: 100 });
      const { order } = await service.createOrder(owner, { ...dto, couponCode: 'BIG' }, 'k');
      expect(order).toMatchObject({ discountAmount: 100, totalAmount: 0 });
    });

    it('propagates invalid coupon error', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem()] });
      coupon.validate.mockRejectedValue(new BadRequestException('bad coupon'));
      await expect(service.createOrder(owner, { ...dto, couponCode: 'X' }, 'k')).rejects.toThrow('bad coupon');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails when atomic reservation loses the race', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 1, items: [cartItem()] });
      tx.$executeRaw.mockResolvedValue(0);
      await expect(service.createOrder(owner, dto, 'k')).rejects.toThrow('Insufficient stock for product variant 5');
      expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('uses guest session cart and sends confirmation email', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 2, items: [cartItem()] });
      await service.createOrder({ userId: null, sessionId: 's1' }, { ...dto, customerEmail: 'a@b.c' }, 'k');
      expect(prisma.cart.findFirst.mock.calls[0][0].where).toEqual({ sessionId: 's1' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(email.sendOrderConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.c', currency: 'UAH' }));
    });
  });

  describe('updateOrderStatus', () => {
    const order = (status: OrderStatus) => ({
      id: 1,
      status,
      orderNumber: 'ORD-1',
      customerEmail: null,
      items: [{ productVariantId: 5, quantity: 2 }, { productVariantId: null, quantity: 1 }],
    });

    const arrange = (from: OrderStatus, to: OrderStatus) => {
      prisma.order.findUnique.mockResolvedValue(order(from));
      tx.order.findUniqueOrThrow.mockResolvedValue({ ...order(to) });
    };

    it('throws when order missing', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus(1, { newStatus: OrderStatus.PROCESSING })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects same status', async () => {
      arrange(OrderStatus.NEW, OrderStatus.NEW);
      await expect(service.updateOrderStatus(1, { newStatus: OrderStatus.NEW })).rejects.toThrow('already');
    });

    it.each([
      [OrderStatus.NEW, OrderStatus.SHIPPED],
      [OrderStatus.NEW, OrderStatus.DELIVERED],
      [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED, OrderStatus.NEW],
      [OrderStatus.RETURNED, OrderStatus.DELIVERED],
    ])('forbids %s -> %s', async (from, to) => {
      arrange(from, to);
      await expect(service.updateOrderStatus(1, { newStatus: to })).rejects.toThrow('Invalid status transition');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('NEW -> PROCESSING records history without touching stock', async () => {
      arrange(OrderStatus.NEW, OrderStatus.PROCESSING);
      await service.updateOrderStatus(1, { newStatus: OrderStatus.PROCESSING, note: 'ok' });
      expect(tx.productVariant.update).not.toHaveBeenCalled();
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: { orderId: 1, oldStatus: OrderStatus.NEW, newStatus: OrderStatus.PROCESSING, note: 'ok' },
      });
      expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: OrderStatus.PROCESSING } });
      expect(cache.invalidateProduct).not.toHaveBeenCalled();
    });

    it('cancel releases reserved stock', async () => {
      arrange(OrderStatus.PROCESSING, OrderStatus.CANCELLED);
      await service.updateOrderStatus(1, { newStatus: OrderStatus.CANCELLED });
      expect(tx.productVariant.update).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { reservedQty: { decrement: 2 } },
      });
      expect(cache.invalidateProduct).toHaveBeenCalled();
    });

    it('delivered writes off stock and reservation, notifies low stock', async () => {
      arrange(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
      tx.productVariant.update.mockResolvedValue({
        sku: 'SKU5',
        stockQty: 2,
        product: { name: 'Shirt' },
        size: { name: 'M' },
        color: null,
      });
      await service.updateOrderStatus(1, { newStatus: OrderStatus.DELIVERED });
      expect(tx.productVariant.update.mock.calls[0][0].data).toEqual({
        reservedQty: { decrement: 2 },
        stockQty: { decrement: 2 },
      });
      expect(telegram.sendLowStockNotification).toHaveBeenCalledWith({
        productName: 'Shirt', sku: 'SKU5', size: 'M', color: undefined, stock: 2,
      });
      expect(cache.invalidateRelated).toHaveBeenCalled();
    });

    it('delivered -> returned restocks', async () => {
      arrange(OrderStatus.DELIVERED, OrderStatus.RETURNED);
      await service.updateOrderStatus(1, { newStatus: OrderStatus.RETURNED });
      expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { stockQty: { increment: 2 } } });
    });

    it('shipped -> returned releases reservation instead of restocking', async () => {
      arrange(OrderStatus.SHIPPED, OrderStatus.RETURNED);
      await service.updateOrderStatus(1, { newStatus: OrderStatus.RETURNED });
      expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { reservedQty: { decrement: 2 } } });
      expect(tx.productVariant.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { stockQty: { increment: 2 } } }));
    });
  });
});
