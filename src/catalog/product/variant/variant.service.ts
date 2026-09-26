import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ProductType, SizeType } from '@prisma/client';
import { CacheService } from '../../../cache/cache.service';
import { StockNotificationService } from '../../../stock-notification/stock-notification.service';
import { CreateVariantDto, UpdateVariantDto } from './dto';

const PRODUCT_TYPE_TO_SIZE_TYPE: Record<ProductType, SizeType> = {
  CLOTHING: SizeType.CLOTHING,
  SHOES: SizeType.SHOES,
  ACCESSORY: SizeType.ACCESSORY,
};

@Injectable()
export class VariantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly stockNotificationService: StockNotificationService,
  ) {}

  async findAll(productId: number) {
    await this.findProductOrThrow(productId);

    return this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      include: {
        size: { select: { id: true, name: true, sizeType: true } },
        color: { select: { id: true, name: true, hexCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(productId: number, dto: CreateVariantDto) {
    const product = await this.findProductOrThrow(productId);

    await this.validateSkuUnique(dto.sku);
    await this.validateSize(dto.sizeId, product.productType);
    await this.validateColor(dto.colorId);

    if (
      (product.productType === ProductType.CLOTHING ||
        product.productType === ProductType.SHOES) &&
      !dto.sizeId
    ) {
      throw new BadRequestException(
        `sizeId is required for productType "${product.productType}"`,
      );
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        ...dto,
      },
      include: {
        size: { select: { id: true, name: true, sizeType: true } },
        color: { select: { id: true, name: true, hexCode: true } },
      },
    });

    await this.cacheService.invalidateProduct(product.slug);
    return variant;
  }

  async update(productId: number, id: number, dto: UpdateVariantDto) {
    const product = await this.findProductOrThrow(productId);
    await this.findVariantOrThrow(productId, id);

    if (dto.sku !== undefined) {
      await this.validateSkuUnique(dto.sku, id);
    }

    if (dto.sizeId !== undefined) {
      await this.validateSize(dto.sizeId, product.productType);
    }

    if (dto.colorId !== undefined) {
      await this.validateColor(dto.colorId);
    }

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data: dto,
      include: {
        size: { select: { id: true, name: true, sizeType: true } },
        color: { select: { id: true, name: true, hexCode: true } },
      },
    });

    await this.cacheService.invalidateProduct(product.slug);

    // Пополнили остаток — уведомляем подписчиков на наявність (не-фатально).
    if (dto.stockQty !== undefined) {
      await this.stockNotificationService.notifyBackInStock(productId);
    }

    return variant;
  }

  async remove(productId: number, id: number) {
    const product = await this.findProductOrThrow(productId);
    await this.findVariantOrThrow(productId, id);

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.cacheService.invalidateProduct(product.slug);
    return variant;
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

  private async findVariantOrThrow(productId: number, id: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, productId, deletedAt: null },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with id ${id} not found for product ${productId}`,
      );
    }

    return variant;
  }

  private async validateSkuUnique(sku: string, excludeId?: number) {
    const existing = await this.prisma.productVariant.findFirst({
      where: {
        sku,
        deletedAt: null,
        ...(excludeId !== undefined && { id: { not: excludeId } }),
      },
    });

    if (existing) {
      throw new ConflictException(`Variant with SKU "${sku}" already exists`);
    }
  }

  private async validateSize(sizeId: number | undefined, productType: ProductType) {
    if (sizeId === undefined) return;

    const size = await this.prisma.size.findUnique({ where: { id: sizeId } });

    if (!size) {
      throw new BadRequestException(`Size with id ${sizeId} not found`);
    }

    if (!size.isActive) {
      throw new BadRequestException(`Size with id ${sizeId} is not active`);
    }

    const expectedSizeType = PRODUCT_TYPE_TO_SIZE_TYPE[productType];

    if (size.sizeType !== expectedSizeType) {
      throw new BadRequestException(
        `Size type "${size.sizeType}" does not match product type "${productType}" (expected "${expectedSizeType}")`,
      );
    }
  }

  private async validateColor(colorId: number | undefined) {
    if (colorId === undefined) return;

    const color = await this.prisma.color.findUnique({ where: { id: colorId } });

    if (!color) {
      throw new BadRequestException(`Color with id ${colorId} not found`);
    }

    if (!color.isActive) {
      throw new BadRequestException(`Color with id ${colorId} is not active`);
    }
  }
}
