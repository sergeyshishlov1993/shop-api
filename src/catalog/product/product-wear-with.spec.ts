import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductService } from './product.service';

describe('ProductService wear-with', () => {
  let prisma: any;
  let cache: any;
  let service: ProductService;

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn() },
      productWearWith: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockReturnValue('del'),
        createMany: jest.fn().mockReturnValue('create'),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    cache = { invalidateRelated: jest.fn() };
    service = new ProductService(prisma, cache);
  });

  it('get: 404 for missing product', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getWearWith(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get: maps rows to cards and drops deleted', async () => {
    prisma.productWearWith.findMany.mockResolvedValue([
      { relatedProduct: { id: 3, name: 'A', slug: 'a', basePrice: 10, deletedAt: null, media: [{ file: { id: 9, s3Key: 'k', s3KeyThumb: null } }] } },
      { relatedProduct: { id: 4, name: 'B', slug: 'b', basePrice: 20, deletedAt: new Date(), media: [] } },
    ]);
    expect(await service.getWearWith(1)).toEqual([
      { id: 3, name: 'A', slug: 'a', price: 10, mainImage: { id: 9, s3Key: 'k', s3KeyThumb: null } },
    ]);
  });

  it.each([
    ['self', [1, 2]],
    ['duplicates', [2, 2]],
    ['more than 12', Array.from({ length: 13 }, (_, i) => i + 2)],
  ])('set: rejects %s', async (_n, ids) => {
    await expect(service.setWearWith(1, { productIds: ids })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('set: rejects missing/deleted ids', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 2 }]);
    await expect(service.setWearWith(1, { productIds: [2, 5] })).rejects.toThrow('5');
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [2, 5] }, deletedAt: null } }));
  });

  it('set: replaces list in given order and invalidates cache', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 2 }, { id: 5 }]);
    await service.setWearWith(1, { productIds: [5, 2] });
    expect(prisma.productWearWith.deleteMany).toHaveBeenCalledWith({ where: { productId: 1 } });
    expect(prisma.productWearWith.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 1, relatedProductId: 5, sortOrder: 0 },
        { productId: 1, relatedProductId: 2, sortOrder: 1 },
      ],
    });
    expect(cache.invalidateRelated).toHaveBeenCalled();
  });

  it('set: empty list clears', async () => {
    await service.setWearWith(1, { productIds: [] });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.productWearWith.createMany).toHaveBeenCalledWith({ data: [] });
  });
});
