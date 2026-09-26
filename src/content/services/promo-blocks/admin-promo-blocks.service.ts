import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PromoBlockType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreatePromoBlockLinkProductDto } from '../../dto/create-promo-block-link-product.dto';
import { CreatePromoBlockDto } from '../../dto/create-promo-block.dto';
import { DeletePromoBlockLinkProductDto } from '../../dto/delete-promo-block-link-product.dto';
import { GetAdminPromoBlocksQueryDto } from '../../dto/get-admin-promo-blocks-query.dto';
import { UpdatePromoBlockDto } from '../../dto/update-promo-block.dto';

@Injectable()
export class AdminPromoBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async getPromoBlocks(query: GetAdminPromoBlocksQueryDto) {
    const where: Prisma.PromoBlockWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    return this.prisma.promoBlock.findMany({
      where,
      include: {
        imageFile: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } },
        products: {
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

  async createPromoBlock(dto: CreatePromoBlockDto) {
    return this.prisma.promoBlock.create({
      data: {
        type: dto.type,
        title: dto.title,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        imageFileId: dto.imageFileId,
        focalX: dto.focalX,
        focalY: dto.focalY,
        focalXTablet: dto.focalXTablet,
        focalYTablet: dto.focalYTablet,
        focalXMobile: dto.focalXMobile,
        focalYMobile: dto.focalYMobile,
      },
      include: {
        imageFile: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } },
        products: {
          include: {
            product: {
              select: this.productSelect(),
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  async updatePromoBlock(id: number, dto: UpdatePromoBlockDto) {
    await this.findPromoBlockByIdOrThrow(id);

    return this.prisma.promoBlock.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
        imageFileId: dto.imageFileId,
        focalX: dto.focalX,
        focalY: dto.focalY,
        focalXTablet: dto.focalXTablet,
        focalYTablet: dto.focalYTablet,
        focalXMobile: dto.focalXMobile,
        focalYMobile: dto.focalYMobile,
      },
      include: {
        imageFile: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } },
        products: {
          include: {
            product: {
              select: this.productSelect(),
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  async deletePromoBlock(id: number) {
    await this.findPromoBlockByIdOrThrow(id);

    await this.prisma.promoBlock.delete({
      where: { id },
    });

    return { message: 'Promo block deleted' };
  }

  async addProduct(id: number, dto: CreatePromoBlockLinkProductDto) {
    await this.findPromoBlockByIdOrThrow(id);
    await this.findProductByIdOrThrow(dto.productId);

    try {
      return await this.prisma.promoBlockProduct.create({
        data: {
          promoBlockId: id,
          productId: dto.productId,
          sortOrder: dto.sortOrder,
        },
        include: {
          product: {
            select: this.productSelect(),
          },
          promoBlock: true,
        },
      });
    } catch {
      throw new BadRequestException('Product already linked to promo block');
    }
  }

  async removeProduct(id: number, dto: DeletePromoBlockLinkProductDto) {
    await this.findPromoBlockByIdOrThrow(id);

    const promoBlockProduct = await this.prisma.promoBlockProduct.findUnique({
      where: {
        promoBlockId_productId: {
          promoBlockId: id,
          productId: dto.productId,
        },
      },
    });

    if (!promoBlockProduct) {
      throw new NotFoundException('Promo block product link not found');
    }

    await this.prisma.promoBlockProduct.delete({
      where: {
        promoBlockId_productId: {
          promoBlockId: id,
          productId: dto.productId,
        },
      },
    });

    return { message: 'Product removed from promo block' };
  }

  private async findPromoBlockByIdOrThrow(id: number) {
    const promoBlock = await this.prisma.promoBlock.findUnique({
      where: { id },
    });

    if (!promoBlock) {
      throw new NotFoundException('Promo block not found');
    }

    return promoBlock;
  }

  private async findProductByIdOrThrow(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private productSelect() {
    return {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      oldPrice: true,
      isActive: true,
      isNew: true,
      isHit: true,
      isSeasonal: true,
      createdAt: true,
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
        select: {
          id: true,
          price: true,
          stockQty: true,
          reservedQty: true,
          isActive: true,
        },
      },
    } satisfies Prisma.ProductSelect;
  }
}
