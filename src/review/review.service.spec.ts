import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewService } from './review.service';

const user = { id: 1, firstName: 'A', lastName: 'B', role: 'USER', avatarFile: null };
const node = (over: any = {}) => ({
  id: 1, parentId: null, depth: 0, rating: 5, text: 't', status: 'APPROVED', createdAt: new Date(),
  editedAt: null, likesCount: 0, user, media: [], likes: [], ...over,
});
const file = {} as Express.Multer.File;

function setup() {
  const review = {
    findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(async () => node()),
    update: jest.fn(async () => node()), deleteMany: jest.fn(), count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }),
  };
  const tx = {
    reviewLike: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    review: { update: jest.fn() },
  };
  const prisma: any = {
    review,
    product: { findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'P' }) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const fileService: any = { upload: jest.fn(async () => ({ id: 42, fileType: 'IMAGE' })) };
  const telegram: any = { sendNewReviewNotification: jest.fn() };
  const s3: any = { getSignedUrl: jest.fn() };
  return { prisma, tx, fileService, service: new ReviewService(prisma, s3, telegram, fileService) };
}

describe('ReviewService', () => {
  describe('createReview', () => {
    it('409 on duplicate', async () => {
      const { service, prisma } = setup();
      prisma.review.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.createReview(1, 1, { rating: 5, text: 'x' } as any)).rejects.toThrow(ConflictException);
    });
    it('400 on >5 media', async () => {
      const { service, prisma } = setup();
      await expect(service.createReview(1, 1, { rating: 5 } as any, Array(6).fill(file))).rejects.toThrow(BadRequestException);
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });
    it('creates APPROVED review with uploaded media', async () => {
      const { service, prisma } = setup();
      prisma.review.findFirst.mockResolvedValue(null);
      await service.createReview(1, 1, { rating: 4, text: 'x' } as any, [file]);
      expect(prisma.review.create.mock.calls[0][0].data).toMatchObject({
        status: ReviewStatus.APPROVED, depth: 0, rating: 4, media: { create: [{ fileId: 42, mediaType: 'IMAGE' }] },
      });
    });
  });

  describe('createReply', () => {
    it('clamps depth: reply to depth-2 attaches to its parent at depth 2', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 30, parentId: 20, depth: 2, productId: 1, status: 'APPROVED' });
      await service.createReply(30, 1, { text: 'r' } as any);
      expect(prisma.review.create.mock.calls[0][0].data).toMatchObject({ parentId: 20, depth: 2, rating: null });
    });
    it('reply to depth 0 → depth 1 under target', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 10, parentId: null, depth: 0, productId: 1, status: 'APPROVED' });
      await service.createReply(10, 1, { text: 'r' } as any);
      expect(prisma.review.create.mock.calls[0][0].data).toMatchObject({ parentId: 10, depth: 1 });
    });
    it('404 when target not APPROVED', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 10, depth: 0, status: 'PENDING' });
      await expect(service.createReply(10, 1, { text: 'r' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOwnReview', () => {
    it('404 / 403', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValueOnce(null);
      await expect(service.updateOwnReview(1, 1, {} as any)).rejects.toThrow(NotFoundException);
      prisma.review.findUnique.mockResolvedValueOnce({ id: 1, userId: 2, depth: 0, media: [] });
      await expect(service.updateOwnReview(1, 1, {} as any)).rejects.toThrow(ForbiddenException);
    });
    it('sets editedAt, removes only own media ids', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1, depth: 0, media: [{ id: 1 }, { id: 2 }] });
      await service.updateOwnReview(1, 1, { text: 'n', removeMediaIds: [2, 99] } as any, [file]);
      const data = prisma.review.update.mock.calls[0][0].data;
      expect(data.editedAt).toBeInstanceOf(Date);
      expect(data.media).toEqual({ deleteMany: { id: { in: [2] } }, create: [{ fileId: 42, mediaType: 'IMAGE' }] });
    });
    it('400 when resulting media > 5', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1, depth: 0, media: [1, 2, 3, 4].map((id) => ({ id })) });
      await expect(service.updateOwnReview(1, 1, { removeMediaIds: [99] } as any, [file, file])).rejects.toThrow(BadRequestException);
    });
    it('400 when setting rating on a reply', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1, depth: 1, media: [] });
      await expect(service.updateOwnReview(1, 1, { rating: 3 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteOwnReview', () => {
    it('403 for non-author', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 2 });
      await expect(service.deleteOwnReview(1, 1)).rejects.toThrow(ForbiddenException);
      expect(prisma.review.deleteMany).not.toHaveBeenCalled();
    });
    it('deletes review with subtree', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ id: 1, userId: 1 });
      prisma.review.findMany.mockResolvedValueOnce([{ id: 2 }]).mockResolvedValueOnce([{ id: 3 }]);
      await service.deleteOwnReview(1, 1);
      expect(prisma.review.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 2, 3] } } });
    });
  });

  describe('toggleLike', () => {
    it('likes: creates and increments in transaction', async () => {
      const { service, prisma, tx } = setup();
      prisma.review.findUnique.mockResolvedValue({ status: 'APPROVED' });
      tx.reviewLike.findUnique.mockResolvedValue(null);
      tx.review.update.mockResolvedValue({ likesCount: 1 });
      expect(await service.toggleLike(5, 1)).toEqual({ liked: true, likesCount: 1 });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.reviewLike.create).toHaveBeenCalled();
      expect(tx.review.update.mock.calls[0][0].data).toEqual({ likesCount: { increment: 1 } });
    });
    it('unlikes: deletes and decrements', async () => {
      const { service, prisma, tx } = setup();
      prisma.review.findUnique.mockResolvedValue({ status: 'APPROVED' });
      tx.reviewLike.findUnique.mockResolvedValue({ userId: 1 });
      tx.review.update.mockResolvedValue({ likesCount: 0 });
      expect(await service.toggleLike(5, 1)).toEqual({ liked: false, likesCount: 0 });
      expect(tx.reviewLike.delete).toHaveBeenCalled();
      expect(tx.review.update.mock.calls[0][0].data).toEqual({ likesCount: { decrement: 1 } });
    });
    it('404 on non-approved', async () => {
      const { service, prisma } = setup();
      prisma.review.findUnique.mockResolvedValue({ status: 'REJECTED' });
      await expect(service.toggleLike(5, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProductReviews', () => {
    const where = (prisma: any) => prisma.review.findMany.mock.calls[0][0].where;
    it('with_media builds OR including nested replies', async () => {
      const { service, prisma } = setup();
      await service.getProductReviews(1, { filter: 'with_media' } as any);
      const or = where(prisma).OR;
      expect(or).toHaveLength(3);
      expect(or[0]).toEqual({ media: { some: {} } });
      expect(or[2].replies.some.replies.some).toMatchObject({ media: { some: {} } });
    });
    it('mine without user → userId -1 (empty)', async () => {
      const { service, prisma } = setup();
      await service.getProductReviews(1, { filter: 'mine' } as any);
      expect(where(prisma).userId).toBe(-1);
    });
    it.each([
      ['newest', [{ createdAt: 'desc' }]],
      ['popular', [{ likesCount: 'desc' }, { createdAt: 'desc' }]],
      ['rating_asc', [{ rating: 'asc' }, { createdAt: 'desc' }]],
    ])('sort %s', async (sort, orderBy) => {
      const { service, prisma } = setup();
      await service.getProductReviews(1, { sort } as any);
      expect(prisma.review.findMany.mock.calls[0][0].orderBy).toEqual(orderBy);
    });
    it('404 when product missing', async () => {
      const { service, prisma } = setup();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.getProductReviews(1, {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
