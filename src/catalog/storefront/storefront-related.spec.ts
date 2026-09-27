import { NotFoundException } from '@nestjs/common';
import { StorefrontService } from './storefront.service';

describe('StorefrontService.findRelated', () => {
  let prisma: any;
  let service: any;
  const base = { id: 1, categoryId: 10, productType: 'CLOTHING', brand: null };

  // Параметри: ручний список, «купують разом», схожі, категорії для «купують разом».
  function setup(manual: number[], bought: number[], similar: number[], cats: Record<number, number> = {}) {
    prisma.product.findFirst.mockResolvedValue(base);
    prisma.productWearWith.findMany.mockResolvedValue(manual.map((relatedProductId) => ({ relatedProductId })));
    prisma.$queryRawUnsafe.mockResolvedValue(bought.map((productId) => ({ productId, frequency: 1 })));
    prisma.product.findMany.mockImplementation(({ where }: any) => {
      if (where.categoryId) {
        return Promise.resolve(where.id.in.filter((id: number) => cats[id] !== 10).map((id: number) => ({ id })));
      }
      return Promise.resolve(similar.map((id) => ({ id })));
    });
  }

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn(), findMany: jest.fn() },
      productWearWith: { findMany: jest.fn() },
      $queryRawUnsafe: jest.fn(),
    };
    service = new StorefrontService(prisma);
    // Картки: повертаємо id у вхідному порядку (фільтрація наявності перевіряється окремо).
    jest.spyOn(service, 'getRelatedCards').mockImplementation(async (ids: any) => ids.map((id: number) => ({ id })));
  });

  const ids = (cards: { id: number }[]) => cards.map((c) => c.id);

  it('404 when product missing', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.findRelated('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('manual list first, in given order; similar excludes it', async () => {
    setup([7, 5], [5, 8], [9, 7]);
    const r = await service.findRelated('p');
    expect(ids(r.wearWith)).toEqual([7, 5]);
    expect(ids(r.similar)).toEqual([9, 8]);
    expect(ids(r.boughtTogether)).toEqual([5, 8]);
  });

  it('fallback: bought-together from other categories', async () => {
    setup([], [4, 6, 8], [9], { 4: 10, 6: 20, 8: 30 });
    const r = await service.findRelated('p');
    expect(ids(r.wearWith)).toEqual([6, 8]);
    expect(ids(r.similar)).toEqual([9, 4]);
  });

  it('empty wearWith when nothing to suggest', async () => {
    setup([], [4], [], { 4: 10 });
    const r = await service.findRelated('p');
    expect(r.wearWith).toEqual([]);
    expect(ids(r.similar)).toEqual([4]);
  });

  it('similar is capped at 8', async () => {
    setup([100], [11, 12, 13, 14, 15], [1 + 20, 22, 23, 24, 25]);
    const r = await service.findRelated('p');
    expect(r.similar).toHaveLength(8);
  });
});
