import { ConflictException, NotFoundException } from '@nestjs/common';
import { FavoriteService } from './favorite.service';

describe('FavoriteService', () => {
  let prisma: any;
  let service: FavoriteService;

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn() },
      favorite: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      storeSettings: { findFirst: jest.fn().mockResolvedValue(null) },
      review: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new FavoriteService(prisma);
  });

  describe('add', () => {
    it('throws when product missing/inactive', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.add(1, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.favorite.create).not.toHaveBeenCalled();
    });

    it('throws conflict when already favorited', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 5 });
      prisma.favorite.findUnique.mockResolvedValue({ id: 9 });
      await expect(service.add(1, 5)).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates favorite', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 5 });
      prisma.favorite.findUnique.mockResolvedValue(null);
      prisma.favorite.create.mockResolvedValue({ id: 11 });
      await expect(service.add(1, 5)).resolves.toEqual({ favoriteId: 11, productId: 5 });
      expect(prisma.favorite.create).toHaveBeenCalledWith({ data: { userId: 1, productId: 5 } });
    });
  });

  describe('remove', () => {
    it('throws when not favorited', async () => {
      prisma.favorite.findUnique.mockResolvedValue(null);
      await expect(service.remove(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes by composite key', async () => {
      prisma.favorite.findUnique.mockResolvedValue({ id: 3 });
      await service.remove(1, 5);
      expect(prisma.favorite.delete).toHaveBeenCalledWith({
        where: { userId_productId: { userId: 1, productId: 5 } },
      });
    });
  });

  describe('findAll', () => {
    const fav = (productId: number, variants: any[]) => ({
      id: productId * 10,
      createdAt: new Date('2026-01-01'),
      product: {
        id: productId,
        name: `P${productId}`,
        slug: `p${productId}`,
        brand: null,
        basePrice: 100,
        isNew: false,
        isHit: false,
        isSeasonal: false,
        category: { id: 1, name: 'C', slug: 'c' },
        media: [],
        variants,
      },
    });

    it('defaults averageRating/reviewCount to 0 without reviews', async () => {
      prisma.favorite.findMany.mockResolvedValue([fav(1, [{ price: null, stockQty: 10, reservedQty: 0 }])]);
      prisma.favorite.count.mockResolvedValue(1);

      const res = await service.findAll(7, {} as any);

      expect(res.items[0].product).toMatchObject({
        averageRating: 0,
        reviewCount: 0,
        effectivePrice: 100,
        availabilityStatus: 'IN_STOCK',
        mainMedia: null,
      });
      expect(res).toMatchObject({ totalCount: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('maps rounded ratings, min variant price and low stock', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        fav(1, [
          { price: 80, stockQty: 2, reservedQty: 0 },
          { price: null, stockQty: 3, reservedQty: 1 },
        ]),
        fav(2, [{ price: null, stockQty: 50, reservedQty: 0 }]),
      ]);
      prisma.favorite.count.mockResolvedValue(2);
      prisma.review.groupBy.mockResolvedValue([{ productId: 1, _avg: { rating: 4.26 }, _count: { id: 3 } }]);

      const res = await service.findAll(7, { page: 1, limit: 20 } as any);

      expect(res.items[0].product).toMatchObject({
        averageRating: 4.3,
        reviewCount: 3,
        effectivePrice: 80,
        availabilityStatus: 'LOW_STOCK',
      });
      expect(res.items[1].product).toMatchObject({ averageRating: 0, reviewCount: 0 });
    });

    it('skips review aggregation when list is empty', async () => {
      prisma.favorite.findMany.mockResolvedValue([]);
      prisma.favorite.count.mockResolvedValue(0);
      const res = await service.findAll(7, { page: 2, limit: 10 } as any);
      expect(prisma.review.groupBy).not.toHaveBeenCalled();
      expect(prisma.favorite.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
      expect(res).toMatchObject({ items: [], totalPages: 0 });
    });
  });

  it('check marks favorite product ids', async () => {
    prisma.favorite.findMany.mockResolvedValue([{ productId: 2 }]);
    await expect(service.check(1, [1, 2])).resolves.toEqual([
      { productId: 1, isFavorite: false },
      { productId: 2, isFavorite: true },
    ]);
  });
});
