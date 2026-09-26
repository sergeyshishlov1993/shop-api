import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto';
import { CartOwner } from './interfaces/cart-owner.interface';

const LOW_STOCK_THRESHOLD = 3;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  resolveCartOwner(params: {
    userId?: number | null;
    sessionId?: string | null;
  }): CartOwner {
    const userId = params.userId ?? null;
    const sessionId = params.sessionId ?? null;

    if (userId) {
      return {
        userId,
        sessionId: null,
        isGuest: false,
      };
    }

    if (sessionId) {
      return {
        userId: null,
        sessionId,
        isGuest: true,
      };
    }

    throw new UnauthorizedException('Cart owner could not be resolved');
  }

  async mergeGuestCartToUser(params: {
    userId: number;
    sessionId?: string | null;
  }): Promise<void> {
    const sessionId = params.sessionId ?? null;
    if (!sessionId) {
      return;
    }

    const guestCart = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: {
        items: true,
      },
    });

    if (!guestCart) {
      return;
    }

    const userCart = await this.prisma.cart.findUnique({
      where: { userId: params.userId },
      include: {
        items: true,
      },
    });

    if (!userCart) {
      await this.prisma.cart.update({
        where: { id: guestCart.id },
        data: {
          userId: params.userId,
          sessionId: null,
        },
      });

      return;
    }

    for (const guestItem of guestCart.items) {
      const existingUserItem = userCart.items.find(
        (item) => item.productVariantId === guestItem.productVariantId,
      );

      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: guestItem.productVariantId,
          isActive: true,
          deletedAt: null,
          product: {
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          product: true,
        },
      });

      if (!variant) {
        continue;
      }

      const currentPrice = variant.price ?? variant.product.basePrice;
      const availableQty = Math.max(variant.stockQty - variant.reservedQty, 0);

      if (availableQty <= 0) {
        continue;
      }

      if (existingUserItem) {
        const mergedQty = Math.min(
          Math.max(existingUserItem.quantity, guestItem.quantity),
          availableQty,
        );

        await this.prisma.cartItem.update({
          where: { id: existingUserItem.id },
          data: {
            quantity: mergedQty,
            unitPriceSnapshot: currentPrice,
          },
        });
      } else {
        const nextQty = Math.min(guestItem.quantity, availableQty);

        await this.prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productVariantId: guestItem.productVariantId,
            quantity: nextQty,
            unitPriceSnapshot: currentPrice,
          },
        });
      }
    }

    await this.prisma.cart.delete({
      where: { id: guestCart.id },
    });
  }

  async getCart(owner: CartOwner) {
    const cart = await this.getOrCreateCart(owner);

    const cartWithItems = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            productVariant: {
              include: {
                size: true,
                color: true,
                product: {
                  include: {
                    // Фото варіанта може не бути — тоді показуємо головне фото товару.
                    media: {
                      where: { isMain: true, variantId: null },
                      take: 1,
                      include: {
                    file: {
                          select: {
                            id: true,
                            s3Key: true,
                            s3KeyThumb: true,
                            s3KeyMedium: true,
                            s3KeyLarge: true,
                          },
                        },
                      },
                    },
                  },
                },
                media: {
                  where: { isMain: true },
                  orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                  include: {
                    file: {
                      select: {
                        id: true,
                        s3Key: true,
                        s3KeyThumb: true,
                        s3KeyMedium: true,
                        s3KeyLarge: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cartWithItems) {
      throw new NotFoundException('Cart not found');
    }

    const items = cartWithItems.items.map((item) => {
      const variant = item.productVariant;
      const product = variant.product;
      const availableQty = Math.max(variant.stockQty - variant.reservedQty, 0);
      const currentUnitPrice = variant.price ?? product.basePrice;
      const availabilityStatus =
        availableQty > LOW_STOCK_THRESHOLD ? 'IN_STOCK' : 'LOW_STOCK';

      return {
        id: item.id,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot,
        currentUnitPrice,
        lineTotal: item.quantity * currentUnitPrice,
        availabilityStatus,
        availableQty,
        variant: {
          id: variant.id,
          sku: variant.sku,
          price: variant.price,
          stockQty: variant.stockQty,
          reservedQty: variant.reservedQty,
          size: variant.size
            ? {
                id: variant.size.id,
                name: variant.size.name,
                sizeType: variant.size.sizeType,
              }
            : null,
          color: variant.color
            ? {
                id: variant.color.id,
                name: variant.color.name,
                hexCode: variant.color.hexCode,
              }
            : null,
          mainImage: variant.media[0]?.file ?? product.media[0]?.file ?? null,
        },
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          productType: product.productType,
          brand: product.brand,
          basePrice: product.basePrice,
          oldPrice: product.oldPrice,
          isNew: product.isNew,
          isHit: product.isHit,
          isSeasonal: product.isSeasonal,
        },
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      id: cartWithItems.id,
      userId: cartWithItems.userId,
      sessionId: cartWithItems.sessionId,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
    };
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(owner);
    const variant = await this.getValidatedVariant(dto.variantId);

    const currentPrice = variant.price ?? variant.product.basePrice;
    const availableQty = variant.stockQty - variant.reservedQty;

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: cart.id,
          productVariantId: variant.id,
        },
      },
    });

    const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

    if (nextQuantity > availableQty) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: nextQuantity,
          unitPriceSnapshot: currentPrice,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productVariantId: variant.id,
          quantity: dto.quantity,
          unitPriceSnapshot: currentPrice,
        },
      });
    }

    return this.getCart(owner);
  }

  async updateItem(owner: CartOwner, itemId: number, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(owner);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
      include: {
        productVariant: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.quantity === 0) {
      await this.prisma.cartItem.delete({
        where: { id: item.id },
      });

      return this.getCart(owner);
    }

    const variant = item.productVariant;
    const product = variant.product;

    if (!variant.isActive || variant.deletedAt !== null) {
      throw new BadRequestException('Product variant is unavailable');
    }

    if (!product.isActive || product.deletedAt !== null) {
      throw new BadRequestException('Product is unavailable');
    }

    const availableQty = variant.stockQty - variant.reservedQty;

    if (dto.quantity > availableQty) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }

    const currentPrice = variant.price ?? product.basePrice;

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity: dto.quantity,
        unitPriceSnapshot: currentPrice,
      },
    });

    return this.getCart(owner);
  }

  async removeItem(owner: CartOwner, itemId: number) {
    const cart = await this.getOrCreateCart(owner);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({
      where: { id: item.id },
    });

    return this.getCart(owner);
  }

  private async getOrCreateCart(owner: CartOwner) {
    if (owner.userId) {
      const existing = await this.prisma.cart.findUnique({
        where: { userId: owner.userId },
      });

      if (existing) {
        return existing;
      }

      return this.prisma.cart.create({
        data: {
          userId: owner.userId,
        },
      });
    }

    if (owner.sessionId) {
      const existing = await this.prisma.cart.findUnique({
        where: { sessionId: owner.sessionId },
      });

      if (existing) {
        return existing;
      }

      return this.prisma.cart.create({
        data: {
          sessionId: owner.sessionId,
        },
      });
    }

    throw new UnauthorizedException('Cart owner could not be resolved');
  }

  private async getValidatedVariant(variantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        deletedAt: null,
        product: {
          isActive: true,
          deletedAt: null,
        },
      },
      include: {
        product: true,
      },
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    const availableQty = variant.stockQty - variant.reservedQty;

    if (availableQty <= 0) {
      throw new BadRequestException('Product variant is out of stock');
    }

    return variant;
  }
}
