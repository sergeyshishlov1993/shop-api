import { Injectable } from '@nestjs/common';
import { Prisma, PromoBlockType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GetStorefrontPromoBlocksQueryDto } from '../../dto/get-storefront-promo-blocks-query.dto';

@Injectable()
export class StorefrontPromoBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async getPromoBlocks(query: GetStorefrontPromoBlocksQueryDto) {
    const where: Prisma.PromoBlockWhereInput = {
      isActive: true,
      ...(query.type ? { type: query.type } : {}),
    };

    return this.prisma.promoBlock.findMany({
      where,
      include: {
        imageFile: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } },
        products: {
          where: {
            product: {
              isActive: true,
              deletedAt: null,
              variants: {
                some: {
                  isActive: true,
                  deletedAt: null,
                  stockQty: {
                    gt: 0,
                  },
                },
              },
            },
          },
          include: {
            product: {
              select: this.productSelect(),
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  getCacheKey(type?: PromoBlockType) {
    return ['storefront', 'promo-blocks', type ?? 'all'].join(':');
  }

  private productSelect() {
    return {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      oldPrice: true,
      isNew: true,
      isHit: true,
      isSeasonal: true,
      media: {
        select: {
          id: true,
          sortOrder: true,
          isMain: true,
          mediaType: true,
          file: {
            select: {
              id: true,
              fileType: true,
              originalName: true,
              mimeType: true,
              s3Key: true,
              s3KeyThumb: true,
              s3KeyMedium: true,
              s3KeyLarge: true,
              previewFileId: true,
            },
          },
        },
        orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      },
      variants: {
        where: {
          isActive: true,
          deletedAt: null,
          stockQty: {
            gt: 0,
          },
        },
        select: {
          id: true,
          price: true,
          stockQty: true,
          reservedQty: true,
        },
      },
    } satisfies Prisma.ProductSelect;
  }
}
