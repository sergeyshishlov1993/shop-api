import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { hashToken } from '../auth/token-hash';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { loadVariantImages } from '../common/utils/variant-image';
import { FileService } from '../file/file.service';
import { GetAccountOrdersQueryDto } from './dto/get-account-orders-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly fileService: FileService,
  ) {}

  async getProfile(userId: number) {
    const { passwordHash, ...profile } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { avatarFile: true },
    });
    return profile;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const { passwordHash, ...profile } = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      include: { avatarFile: true },
    });

    return profile;
  }

  async updateAvatar(userId: number, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be a JPEG, PNG or WebP image');
    }

    const currentUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });
    const uploaded = await this.fileService.upload(file);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: uploaded.id },
      include: { avatarFile: true },
    });

    if (currentUser.avatarFileId && currentUser.avatarFileId !== uploaded.id) {
      await this.fileService.delete(currentUser.avatarFileId).catch(() => undefined);
    }

    const { passwordHash, ...profile } = user;
    return profile;
  }

  async deleteAvatar(userId: number) {
    const currentUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: null },
      include: { avatarFile: true },
    });

    if (currentUser.avatarFileId) {
      await this.fileService.delete(currentUser.avatarFileId).catch(() => undefined);
    }

    const { passwordHash, ...profile } = user;
    return profile;
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string, currentRefreshToken?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.passwordHash) {
      throw new UnauthorizedException('Account has no password set');
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    // Відкликаємо всі сесії, крім поточної
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentRefreshToken && { tokenHash: { not: hashToken(currentRefreshToken) } }),
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password changed successfully' };
  }

  async getOrders(userId: number, query: GetAccountOrdersQueryDto) {
    const where = this.buildOrdersWhere(userId, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          totalAmount: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              productVariantId: true,
              productName: true,
              sizeName: true,
              colorName: true,
              quantity: true,
              salePrice: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const images = await loadVariantImages(
      this.prisma,
      items.flatMap((order) => order.items.map((item) => item.productVariantId)),
    );

    return {
      items: items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        status: order.status,
        total: order.totalAmount,
        itemsCount: order.items.length,
        items: order.items.map(({ productVariantId, ...item }) => ({
          ...item,
          image: productVariantId ? images.get(productVariantId) ?? null : null,
        })),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getOrderById(userId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: {
          orderBy: {
            id: 'asc',
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const images = await loadVariantImages(
      this.prisma,
      order.items.map((item) => item.productVariantId),
    );

    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        image: item.productVariantId ? images.get(item.productVariantId) ?? null : null,
      })),
    };
  }

  async reorder(userId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: {
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const owner = this.cartService.resolveCartOwner({
      userId,
      sessionId: null,
    });

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const added: Array<{
      variantId: number;
      productName: string;
      size: string | null;
      color: string | null;
      qty: number;
    }> = [];

    const skipped: Array<{
      productName: string;
      size: string | null;
      color: string | null;
      reason: string;
    }> = [];

    for (const item of order.items) {
      if (!item.productVariantId) {
        skipped.push({
          productName: item.productName,
          size: item.sizeName,
          color: item.colorName,
          reason: 'Variant not found',
        });
        continue;
      }

      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: item.productVariantId,
          isActive: true,
          deletedAt: null,
          product: {
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          product: true,
          size: true,
          color: true,
        },
      });

      if (!variant) {
        skipped.push({
          productName: item.productName,
          size: item.sizeName,
          color: item.colorName,
          reason: 'Variant unavailable',
        });
        continue;
      }

      const availableQty = Math.max(variant.stockQty - variant.reservedQty, 0);

      if (availableQty <= 0) {
        skipped.push({
          productName: item.productName,
          size: variant.size?.name ?? item.sizeName,
          color: variant.color?.name ?? item.colorName,
          reason: 'Out of stock',
        });
        continue;
      }

      const qtyToAdd = Math.min(item.quantity, availableQty);
      const currentPrice = variant.price ?? variant.product.basePrice;

      const existingCartItem = await this.prisma.cartItem.findUnique({
        where: {
          cartId_productVariantId: {
            cartId: cart.id,
            productVariantId: variant.id,
          },
        },
      });

      if (existingCartItem) {
        const nextQuantity = Math.min(existingCartItem.quantity + qtyToAdd, availableQty);

        if (nextQuantity === existingCartItem.quantity) {
          skipped.push({
            productName: variant.product.name,
            size: variant.size?.name ?? item.sizeName,
            color: variant.color?.name ?? item.colorName,
            reason: 'Already at max available quantity in cart',
          });
          continue;
        }

        await this.prisma.cartItem.update({
          where: { id: existingCartItem.id },
          data: {
            quantity: nextQuantity,
            unitPriceSnapshot: currentPrice,
          },
        });

        added.push({
          variantId: variant.id,
          productName: variant.product.name,
          size: variant.size?.name ?? item.sizeName,
          color: variant.color?.name ?? item.colorName,
          qty: nextQuantity - existingCartItem.quantity,
        });
        continue;
      }

      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productVariantId: variant.id,
          quantity: qtyToAdd,
          unitPriceSnapshot: currentPrice,
        },
      });

      added.push({
        variantId: variant.id,
        productName: variant.product.name,
        size: variant.size?.name ?? item.sizeName,
        color: variant.color?.name ?? item.colorName,
        qty: qtyToAdd,
      });
    }

    await this.cartService.getCart(owner);

    return { added, skipped };
  }


  async getDeliveryProfiles(userId: number) {
    return this.prisma.userDeliveryProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
  private buildOrdersWhere(userId: number, query: GetAccountOrdersQueryDto) {
    const where: {
      userId: number;
      orderNumber?: { contains: string; mode: 'insensitive' };
      status?: OrderStatus;
      createdAt?: {
        gte?: Date;
        lt?: Date;
      };
    } = {
      userId,
    };

    if (query.orderNumber) {
      where.orderNumber = {
        contains: query.orderNumber,
        mode: 'insensitive',
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.date instanceof Date && !Number.isNaN(query.date.getTime())) {
      const dateFrom = new Date(query.date);
      dateFrom.setHours(0, 0, 0, 0);

      const dateTo = new Date(query.date);
      dateTo.setHours(24, 0, 0, 0);

      where.createdAt = {
        gte: dateFrom,
        lt: dateTo,
      };
    }

    return where;
  }
}
