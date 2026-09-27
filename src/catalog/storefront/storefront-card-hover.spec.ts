import { BadRequestException } from '@nestjs/common';
import { pickHoverImage, buildCardSizes } from './storefront.service';
import { MediaService } from '../product/media/media.service';

const f = (id: number) => ({ id, s3Key: `k${id}`, s3KeyThumb: null, s3KeyMedium: null, s3KeyLarge: null });
const m = (id: number, o: { isMain?: boolean; isHover?: boolean } = {}) => ({ productId: 1, isMain: !!o.isMain, isHover: !!o.isHover, file: f(id) });

describe('pickHoverImage', () => {
  it('isHover wins', () => expect(pickHoverImage([m(1, { isMain: true }), m(2), m(3, { isHover: true })])?.id).toBe(3));
  it('fallback: second image after main', () => expect(pickHoverImage([m(1), m(2, { isMain: true }), m(3)])?.id).toBe(1));
  it('fallback without main flag: second by order', () => expect(pickHoverImage([m(1), m(2)])?.id).toBe(2));
  it('none', () => {
    expect(pickHoverImage([m(1, { isMain: true })])).toBeNull();
    expect(pickHoverImage([])).toBeNull();
  });
});

describe('buildCardSizes', () => {
  it('orders by size sortOrder, availability by stock-reserved', () => {
    const r = buildCardSizes([
      { id: 10, stockQty: 2, reservedQty: 2, size: { name: 'L', sortOrder: 3 } },
      { id: 11, stockQty: 5, reservedQty: 1, size: { name: 'S', sortOrder: 1 } },
    ]);
    expect(r).toEqual({ sizes: [{ variantId: 11, name: 'S', available: true }, { variantId: 10, name: 'L', available: false }], defaultVariantId: null });
  });
  it('no sizes: [] and first available variant', () => {
    expect(buildCardSizes([
      { id: 1, stockQty: 0, reservedQty: 0, size: null },
      { id: 2, stockQty: 3, reservedQty: 0, size: null },
    ])).toEqual({ sizes: [], defaultVariantId: 2 });
    expect(buildCardSizes([{ id: 1, stockQty: 1, reservedQty: 1, size: null }]).defaultVariantId).toBeNull();
  });
});

describe('MediaService.update isHover', () => {
  let prisma: any;
  let svc: MediaService;
  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 1 }), findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      productMedia: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 5 }) },
    };
    svc = new MediaService(prisma);
  });
  it('resets other hover media', async () => {
    prisma.productMedia.findFirst.mockResolvedValue({ id: 5, productId: 1, mediaType: 'IMAGE' });
    await svc.update(1, 5, { isHover: true });
    expect(prisma.productMedia.updateMany).toHaveBeenCalledWith({ where: { productId: 1, isHover: true, id: { not: 5 } }, data: { isHover: false } });
    expect(prisma.productMedia.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isHover: true } }));
  });
  it('rejects VIDEO', async () => {
    prisma.productMedia.findFirst.mockResolvedValue({ id: 5, productId: 1, mediaType: 'VIDEO' });
    await expect(svc.update(1, 5, { isHover: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productMedia.update).not.toHaveBeenCalled();
  });
});
