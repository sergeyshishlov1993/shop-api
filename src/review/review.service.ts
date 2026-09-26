import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileAsset,
  FileType,
  MediaType,
  Prisma,
  Review,
  ReviewStatus,
  User,
  UserRole,
} from '@prisma/client';
import { FileService } from '../file/file.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { TelegramService } from '../notification/telegram.service';
import { S3Service } from '../s3/s3.service';
import {
  AdminReplyReviewDto,
  AdminReviewQueryDto,
  CreateReplyDto,
  CreateReviewDto,
  GetReviewsDto,
  ReviewSort,
  UpdateReviewDto,
  UpdateReviewStatusDto,
} from './dto';
import {
  CreateReviewResponse,
  ReviewItem,
  ReviewLikeResponse,
  ReviewReply,
  ReviewsResponse,
  ReviewUserInfo,
} from './interfaces';

type UserWithAvatar = User & {
  avatarFile: FileAsset | null;
};

const MEDIA_INCLUDE = {
  orderBy: { id: 'asc' },
  select: {
    id: true,
    mediaType: true,
    file: {
      select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true },
    },
  },
} as const;
const MAX_MEDIA = 5;
const MAX_DEPTH = 2;

const SORT_ORDER: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  popular: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
  rating_desc: [{ rating: 'desc' }, { createdAt: 'desc' }],
  rating_asc: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

/** Include for a review node: user, media, current user's like. */
function nodeInclude(userId?: number) {
  return {
    user: { include: { avatarFile: true } },
    media: MEDIA_INCLUDE,
    likes: { where: { userId: userId ?? -1 }, select: { userId: true } },
  } as const;
}

type ReviewNode = Review & {
  user: UserWithAvatar;
  media: ReviewItem['media'];
  likes: { userId: number }[];
  replies?: ReviewNode[];
};

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly telegramService: TelegramService,
    private readonly fileService: FileService,
  ) {}

  async getProductReviews(
    productId: number,
    dto: GetReviewsDto,
    userId?: number,
  ): Promise<ReviewsResponse> {
    const { page = 1, limit = 10, sort = 'newest', filter = 'all' } = dto;
    const offset = (page - 1) * limit;

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const listWhere: Prisma.ReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
      depth: 0,
      // Відгук з медіа або з відповіддю (до 2 рівнів), що має медіа
      ...(filter === 'with_media' && {
        OR: [
          { media: { some: {} } },
          { replies: { some: { status: ReviewStatus.APPROVED, media: { some: {} } } } },
          {
            replies: {
              some: { replies: { some: { status: ReviewStatus.APPROVED, media: { some: {} } } } },
            },
          },
        ],
      }),
      // Без користувача фільтр "mine" має повертати порожній список
      ...(filter === 'mine' && { userId: userId ?? -1 }),
    };

    const totalCount = await this.prisma.review.count({ where: listWhere });

    const rootReviews = await this.prisma.review.findMany({
      where: listWhere,
      orderBy: SORT_ORDER[sort],
      skip: offset,
      take: limit,
      include: {
        ...nodeInclude(userId),
        replies: {
          where: { status: ReviewStatus.APPROVED },
          orderBy: { createdAt: 'asc' },
          include: {
            ...nodeInclude(userId),
            replies: {
              where: { status: ReviewStatus.APPROVED },
              orderBy: { createdAt: 'asc' },
              include: nodeInclude(userId),
            },
          },
        },
      },
    });

    const ratingStats = await this.prisma.review.groupBy({
      by: ['rating'],
      where: {
        productId,
        status: ReviewStatus.APPROVED,
        depth: 0,
      },
      _count: {
        rating: true,
      },
    });

    const avgResult = await this.prisma.review.aggregate({
      where: {
        productId,
        status: ReviewStatus.APPROVED,
        depth: 0,
      },
      _avg: {
        rating: true,
      },
    });

    const ratingDistribution: { 1: number; 2: number; 3: number; 4: number; 5: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (const stat of ratingStats) {
      if (stat.rating !== null && stat.rating >= 1 && stat.rating <= 5) {
        ratingDistribution[stat.rating as 1 | 2 | 3 | 4 | 5] = stat._count.rating;
      }
    }

    const items: ReviewItem[] = [];
    for (const review of rootReviews as ReviewNode[]) {
      items.push(await this.mapNode(review));
    }

    return {
      items,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      averageRating: Math.round((avgResult._avg.rating || 0) * 10) / 10,
      ratingDistribution,
    };
  }

  async createReview(
    productId: number,
    userId: number,
    dto: CreateReviewDto,
    files: Express.Multer.File[] = [],
  ): Promise<CreateReviewResponse> {
    if (files.length > MAX_MEDIA) {
      throw new BadRequestException(`Maximum ${MAX_MEDIA} media files allowed`);
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingReview = await this.prisma.review.findFirst({
      where: {
        productId,
        userId,
        depth: 0,
      },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this product');
    }

    const review = await this.prisma.review.create({
      data: {
        productId,
        userId,
        rating: dto.rating,
        text: dto.text,
        depth: 0,
        status: ReviewStatus.APPROVED,
        media: { create: await this.uploadMedia(files) },
      },
      include: nodeInclude(userId),
    });

    await this.telegramService.sendNewReviewNotification({
      productName: product.name,
      rating: dto.rating,
      text: dto.text,
    });

    return {
      ...(await this.mapNode(review as ReviewNode)),
      message: 'Review published',
    };
  }

  async createReply(
    parentId: number,
    userId: number,
    dto: CreateReplyDto,
    files: Express.Multer.File[] = [],
  ): Promise<CreateReviewResponse> {
    if (files.length > MAX_MEDIA) {
      throw new BadRequestException(`Maximum ${MAX_MEDIA} media files allowed`);
    }

    const target = await this.prisma.review.findUnique({ where: { id: parentId } });
    if (!target || target.status !== ReviewStatus.APPROVED) {
      throw new NotFoundException('Review not found');
    }

    // YouTube-style: replying to the deepest level attaches to the same thread
    const attachTo = target.depth >= MAX_DEPTH ? target.parentId! : target.id;
    const depth = Math.min(target.depth + 1, MAX_DEPTH);

    const reply = await this.prisma.review.create({
      data: {
        productId: target.productId,
        userId,
        parentId: attachTo,
        rating: null,
        text: dto.text,
        depth,
        status: ReviewStatus.APPROVED,
        media: { create: await this.uploadMedia(files) },
      },
      include: nodeInclude(userId),
    });

    return {
      ...(await this.mapNode(reply as ReviewNode)),
      message: 'Reply submitted and awaiting moderation',
    };
  }

  async updateOwnReview(
    id: number,
    userId: number,
    dto: UpdateReviewDto,
    files: Express.Multer.File[] = [],
  ): Promise<CreateReviewResponse> {
    const review = await this.findOwn(id, userId, { media: { select: { id: true } } });

    if (dto.rating !== undefined && review.depth !== 0) {
      throw new BadRequestException('Only top-level reviews have a rating');
    }

    const existingIds = review.media.map((m) => m.id);
    const removeIds = (dto.removeMediaIds ?? []).filter((mid) => existingIds.includes(mid));
    if (existingIds.length - removeIds.length + files.length > MAX_MEDIA) {
      throw new BadRequestException(`Maximum ${MAX_MEDIA} media files allowed`);
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        text: dto.text,
        rating: dto.rating,
        editedAt: new Date(),
        status: ReviewStatus.APPROVED,
        media: {
          deleteMany: { id: { in: removeIds } },
          create: await this.uploadMedia(files),
        },
      },
      include: nodeInclude(userId),
    });

    return {
      ...(await this.mapNode(updated as ReviewNode)),
      message: 'Review updated and awaiting moderation',
    };
  }

  async deleteOwnReview(id: number, userId: number): Promise<{ success: true }> {
    await this.findOwn(id, userId);

    // parent relation has no cascade — collect the subtree (max depth 2) explicitly
    const children = await this.prisma.review.findMany({
      where: { parentId: id },
      select: { id: true },
    });
    const grandChildren = await this.prisma.review.findMany({
      where: { parentId: { in: children.map((c) => c.id) } },
      select: { id: true },
    });
    const ids = [id, ...children.map((c) => c.id), ...grandChildren.map((c) => c.id)];

    await this.prisma.review.deleteMany({ where: { id: { in: ids } } });
    return { success: true };
  }

  async toggleLike(reviewId: number, userId: number): Promise<ReviewLikeResponse> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { status: true },
    });
    if (!review || review.status !== ReviewStatus.APPROVED) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const key = { reviewId_userId: { reviewId, userId } };
      const existing = await tx.reviewLike.findUnique({ where: key });

      if (existing) {
        await tx.reviewLike.delete({ where: key });
      } else {
        await tx.reviewLike.create({ data: { reviewId, userId } });
      }

      const { likesCount } = await tx.review.update({
        where: { id: reviewId },
        data: { likesCount: existing ? { decrement: 1 } : { increment: 1 } },
        select: { likesCount: true },
      });

      return { liked: !existing, likesCount };
    });
  }

  private async findOwn<I extends Prisma.ReviewInclude>(id: number, userId: number, include?: I) {
    const review = await this.prisma.review.findUnique({ where: { id }, include });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Not your review');
    return review as Prisma.ReviewGetPayload<{ include: I }>;
  }

  private async uploadMedia(files: Express.Multer.File[]) {
    const media: { fileId: number; mediaType: MediaType }[] = [];
    for (const file of files) {
      const u = await this.fileService.upload(file);
      media.push({
        fileId: u.id,
        mediaType: u.fileType === FileType.VIDEO ? MediaType.VIDEO : MediaType.IMAGE,
      });
    }
    return media;
  }

  async getAdminReviews(query: AdminReviewQueryDto) {
    const where: {
      status?: ReviewStatus;
      productId?: number;
    } = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, totalCount] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          productId: true,
          userId: true,
          parentId: true,
          rating: true,
          text: true,
          depth: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          media: MEDIA_INCLUDE,
          product: {
            select: { id: true, name: true, slug: true },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              avatarFile: {
                select: {
                  id: true,
                  s3KeyThumb: true,
                  s3KeyMedium: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
  }

  async updateReviewStatus(id: number, dto: UpdateReviewStatusDto) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.review.update({
      where: { id },
      data: {
        status: dto.status as ReviewStatus,
      },
      select: {
        id: true,
        productId: true,
        userId: true,
        parentId: true,
        depth: true,
        rating: true,
        text: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async replyToReview(reviewId: number, adminUserId: number, dto: AdminReplyReviewDto) {
    const parentReview = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!parentReview) {
      throw new NotFoundException('Review not found');
    }

    if (parentReview.depth !== 0) {
      throw new BadRequestException('You can only reply to a root review');
    }

    const existingReply = await this.prisma.review.findFirst({
      where: {
        parentId: reviewId,
        depth: 1,
        user: { role: UserRole.ADMIN },
      },
    });

    if (existingReply) {
      throw new ConflictException('Reply for this review already exists');
    }

    const reply = await this.prisma.review.create({
      data: {
        productId: parentReview.productId,
        userId: adminUserId,
        parentId: parentReview.id,
        rating: null,
        text: dto.text,
        depth: 1,
        status: ReviewStatus.APPROVED,
      },
      include: {
        user: {
          include: {
            avatarFile: true,
          },
        },
      },
    });

    return this.mapReply(reply as Review & { user: UserWithAvatar });
  }

  private async mapNode(review: ReviewNode): Promise<ReviewItem> {
    const replies: ReviewItem[] = [];
    for (const reply of review.replies ?? []) {
      replies.push(await this.mapNode(reply));
    }

    return {
      id: review.id,
      parentId: review.parentId,
      depth: review.depth,
      rating: review.rating,
      text: review.text,
      status: review.status,
      createdAt: review.createdAt,
      editedAt: review.editedAt,
      user: await this.mapUserInfo(review.user),
      media: review.media,
      likesCount: review.likesCount,
      likedByMe: review.likes.length > 0,
      isAdminReply: review.user.role === UserRole.ADMIN,
      replies,
    };
  }

  private async mapUserInfo(user: UserWithAvatar): Promise<ReviewUserInfo> {
    let avatar: ReviewUserInfo['avatar'] = null;

    if (user.avatarFile) {
      avatar = {
        thumb: user.avatarFile.s3KeyThumb
          ? await this.s3Service.getSignedUrl(user.avatarFile.s3KeyThumb)
          : null,
        medium: user.avatarFile.s3KeyMedium
          ? await this.s3Service.getSignedUrl(user.avatarFile.s3KeyMedium)
          : null,
      };
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar,
    };
  }

  private async mapReply(reply: Review & { user: UserWithAvatar }): Promise<ReviewReply> {
    return {
      id: reply.id,
      text: reply.text,
      createdAt: reply.createdAt,
      user: await this.mapUserInfo(reply.user),
      isAdminReply: reply.user.role === UserRole.ADMIN,
    };
  }
}
