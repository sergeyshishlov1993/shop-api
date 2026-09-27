import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateMediaDto, UpdateMediaDto, ReorderMediaDto, CreateInstagramMediaDto } from './dto';

const FILE_SELECT = {
  id: true,
  s3Key: true,
  s3KeyThumb: true,
  s3KeyMedium: true,
  s3KeyLarge: true,
  fileType: true,
  originalName: true,
};

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: number) {
    await this.findProductOrThrow(productId);

    return this.prisma.productMedia.findMany({
      where: { productId },
      include: { file: { select: FILE_SELECT } },
      orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async create(productId: number, dto: CreateMediaDto) {
    await this.findProductOrThrow(productId);
    await this.validateFile(dto.fileId);

    if (dto.variantId !== undefined) {
      await this.validateVariant(productId, dto.variantId);
    }

    // Если isMain — сбрасываем у остальных
    if (dto.isMain) {
      await this.resetMainFlag(productId);
    }

    return this.prisma.productMedia.create({
      data: {
        productId,
        ...dto,
      },
      include: { file: { select: FILE_SELECT } },
    });
  }

  async createInstagram(productId: number, dto: CreateInstagramMediaDto) {
    await this.findProductOrThrow(productId);

    if (dto.variantId !== undefined) {
      await this.validateVariant(productId, dto.variantId);
    }

    return this.prisma.productMedia.create({
      data: {
        productId,
        mediaType: 'VIDEO',
        externalUrl: dto.url,
        variantId: dto.variantId,
        sortOrder: dto.sortOrder,
      },
      include: { file: { select: FILE_SELECT } },
    });
  }

  async update(productId: number, id: number, dto: UpdateMediaDto) {
    await this.findProductOrThrow(productId);
    const media = await this.findMediaOrThrow(productId, id);

    if (dto.isHover) {
      if (media.mediaType !== 'IMAGE') {
        throw new BadRequestException('Only IMAGE media can be hover');
      }
      await this.prisma.productMedia.updateMany({
        where: { productId, isHover: true, id: { not: id } },
        data: { isHover: false },
      });
    }

    if (dto.variantId !== undefined && dto.variantId !== null) {
      await this.validateVariant(productId, dto.variantId);
    }

    if (dto.isMain) {
      await this.resetMainFlag(productId);
    }

    return this.prisma.productMedia.update({
      where: { id },
      data: dto,
      include: { file: { select: FILE_SELECT } },
    });
  }

  async reorder(productId: number, dto: ReorderMediaDto) {
    await this.findProductOrThrow(productId);

    const mediaIds = dto.items.map((item) => item.id);

    // Проверяем, что все ID принадлежат этому товару
    const existing = await this.prisma.productMedia.findMany({
      where: { productId, id: { in: mediaIds } },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((m) => m.id));
    const invalid = mediaIds.filter((id) => !existingIds.has(id));

    if (invalid.length > 0) {
      throw new BadRequestException(
        `Media IDs [${invalid.join(', ')}] do not belong to product ${productId}`,
      );
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.productMedia.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return this.findAll(productId);
  }

  async remove(productId: number, id: number) {
    await this.findProductOrThrow(productId);
    await this.findMediaOrThrow(productId, id);

    return this.prisma.productMedia.delete({
      where: { id },
    });
  }

  async setMain(productId: number, id: number) {
    await this.findProductOrThrow(productId);
    await this.findMediaOrThrow(productId, id);

    await this.resetMainFlag(productId);

    return this.prisma.productMedia.update({
      where: { id },
      data: { isMain: true },
      include: { file: { select: FILE_SELECT } },
    });
  }

  private async findProductOrThrow(productId: number) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    return product;
  }

  private async findMediaOrThrow(productId: number, id: number) {
    const media = await this.prisma.productMedia.findFirst({
      where: { id, productId },
    });

    if (!media) {
      throw new NotFoundException(
        `Media with id ${id} not found for product ${productId}`,
      );
    }

    return media;
  }

  private async validateFile(fileId: number) {
    const file = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new BadRequestException(`FileAsset with id ${fileId} not found`);
    }
  }

  private async validateVariant(productId: number, variantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
    });

    if (!variant) {
      throw new BadRequestException(
        `Variant with id ${variantId} not found for product ${productId}`,
      );
    }
  }

  private async resetMainFlag(productId: number) {
    await this.prisma.productMedia.updateMany({
      where: { productId, isMain: true },
      data: { isMain: false },
    });
  }
}
