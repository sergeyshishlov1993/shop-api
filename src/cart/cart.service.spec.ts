import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CartService } from './cart.service';

describe('CartService', () => {
  let prisma: any;
  let service: CartService;
  const userOwner = { userId: 1, sessionId: null, isGuest: false };
  const guestOwner = { userId: null, sessionId: 's1', isGuest: true };

  const variant = (over: any = {}) => ({
    id: 5,
    price: null,
    stockQty: 10,
    reservedQty: 2,
    isActive: true,
    deletedAt: null,
    product: { basePrice: 100, isActive: true, deletedAt: null },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      cart: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      cartItem: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      productVariant: { findFirst: jest.fn() },
    };
    service = new CartService(prisma);
    // getCart is covered separately; isolate mutations
    jest.spyOn(service, 'getCart').mockResolvedValue({ id: 1 } as any);
  });

  describe('resolveCartOwner', () => {
    it('prefers user over session', () => {
      expect(service.resolveCartOwner({ userId: 1, sessionId: 's' })).toEqual(userOwner);
    });
    it('falls back to guest session', () => {
      expect(service.resolveCartOwner({ sessionId: 's1' })).toEqual(guestOwner);
    });
    it('throws without owner', () => {
      expect(() => service.resolveCartOwner({})).toThrow(UnauthorizedException);
    });
  });

  describe('addItem', () => {
    beforeEach(() => prisma.cart.findUnique.mockResolvedValue({ id: 1 }));

    it('creates cart for new guest', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 2 });
      prisma.productVariant.findFirst.mockResolvedValue(variant());
      prisma.cartItem.findUnique.mockResolvedValue(null);
      await service.addItem(guestOwner, { variantId: 5, quantity: 1 });
      expect(prisma.cart.create).toHaveBeenCalledWith({ data: { sessionId: 's1' } });
      expect(prisma.cartItem.create.mock.calls[0][0].data.cartId).toBe(2);
    });

    it('creates new item with price snapshot', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variant());
      prisma.cartItem.findUnique.mockResolvedValue(null);
      await service.addItem(userOwner, { variantId: 5, quantity: 3 });
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 1, productVariantId: 5, quantity: 3, unitPriceSnapshot: 100 },
      });
    });

    it('merges quantity into existing item using variant price', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variant({ price: 80 }));
      prisma.cartItem.findUnique.mockResolvedValue({ id: 7, quantity: 2 });
      await service.addItem(userOwner, { variantId: 5, quantity: 3 });
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { quantity: 5, unitPriceSnapshot: 80 },
      });
    });

    it('rejects when merged quantity exceeds available stock', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variant()); // available 8
      prisma.cartItem.findUnique.mockResolvedValue({ id: 7, quantity: 6 });
      await expect(service.addItem(userOwner, { variantId: 5, quantity: 3 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects out-of-stock variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(variant({ stockQty: 2, reservedQty: 2 }));
      await expect(service.addItem(userOwner, { variantId: 5, quantity: 1 })).rejects.toThrow('out of stock');
    });

    it('rejects unknown variant', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.addItem(userOwner, { variantId: 5, quantity: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateItem', () => {
    beforeEach(() => prisma.cart.findUnique.mockResolvedValue({ id: 1 }));

    it('throws when item not in cart', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);
      await expect(service.updateItem(userOwner, 9, { quantity: 1 })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cartItem.findFirst.mock.calls[0][0].where).toEqual({ id: 9, cartId: 1 });
    });

    it('quantity 0 deletes the item', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 9, productVariant: variant() });
      await service.updateItem(userOwner, 9, { quantity: 0 });
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    it('updates quantity within stock', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 9, productVariant: variant() });
      await service.updateItem(userOwner, 9, { quantity: 8 });
      expect(prisma.cartItem.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { quantity: 8, unitPriceSnapshot: 100 } });
    });

    it('rejects quantity above stock', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 9, productVariant: variant() });
      await expect(service.updateItem(userOwner, 9, { quantity: 9 })).rejects.toThrow('exceeds');
    });

    it('rejects inactive product', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({
        id: 9,
        productVariant: variant({ product: { basePrice: 1, isActive: false, deletedAt: null } }),
      });
      await expect(service.updateItem(userOwner, 9, { quantity: 1 })).rejects.toThrow('Product is unavailable');
    });
  });

  describe('removeItem', () => {
    beforeEach(() => prisma.cart.findUnique.mockResolvedValue({ id: 1 }));

    it('deletes own item', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({ id: 9 });
      await service.removeItem(userOwner, 9);
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    });

    it('throws for foreign/missing item', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);
      await expect(service.removeItem(userOwner, 9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('mergeGuestCartToUser', () => {
    it('no-op without session', async () => {
      await service.mergeGuestCartToUser({ userId: 1, sessionId: null });
      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('reassigns guest cart when user has none', async () => {
      prisma.cart.findUnique.mockResolvedValueOnce({ id: 3, items: [] }).mockResolvedValueOnce(null);
      await service.mergeGuestCartToUser({ userId: 1, sessionId: 's1' });
      expect(prisma.cart.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { userId: 1, sessionId: null } });
      expect(prisma.cart.delete).not.toHaveBeenCalled();
    });

    it('merges items (max qty, capped by stock), skips unavailable, deletes guest cart', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({
          id: 3,
          items: [
            { productVariantId: 5, quantity: 20 },
            { productVariantId: 6, quantity: 2 },
            { productVariantId: 7, quantity: 1 },
          ],
        })
        .mockResolvedValueOnce({ id: 4, items: [{ id: 40, productVariantId: 5, quantity: 1 }] });
      prisma.productVariant.findFirst
        .mockResolvedValueOnce(variant({ id: 5 })) // available 8
        .mockResolvedValueOnce(variant({ id: 6, price: 50 }))
        .mockResolvedValueOnce(null);

      await service.mergeGuestCartToUser({ userId: 1, sessionId: 's1' });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({ where: { id: 40 }, data: { quantity: 8, unitPriceSnapshot: 100 } });
      expect(prisma.cartItem.create).toHaveBeenCalledTimes(1);
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 4, productVariantId: 6, quantity: 2, unitPriceSnapshot: 50 },
      });
      expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });
  });
});
