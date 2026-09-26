import {
    BadRequestException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DeliveryService } from '../delivery/delivery.service';
import { TelegramService } from '../notification/telegram.service';
import { EmailService } from '../email/email.service';
import { CouponService } from '../coupon/coupon.service';
import { CacheService } from '../cache/cache.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type OrderOwner = {
    userId: number | null;
    sessionId: string | null;
};

type OrderWithRelations = Prisma.OrderGetPayload<{
    include: {
        items: true;
        statusHistory: {
            orderBy: {
                createdAt: 'asc';
            };
        };
    };
}>;

type CreateOrderResult = {
    order: OrderWithRelations;
    isIdempotentReplay: boolean;
};

type DeliverySnapshot = {
    deliveryProvider: string | null;
    city: string | null;
    warehouse: string | null;
    addressLine: string | null;
    postalCode: string | null;
    deliveryComment: string | null;
};

type StatusTransitionRule = {
    allowedNextStatuses: OrderStatus[];
    adjustInventory: boolean;
};

type LowStockNotificationItem = {
    productName: string;
    sku: string;
    size: string | undefined;
    color: string | undefined;
    stock: number;
};

@Injectable()
export class OrderService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly telegramService: TelegramService,
        private readonly configService: ConfigService,
        private readonly cacheService: CacheService,
        private readonly deliveryService: DeliveryService,
        private readonly emailService: EmailService,
        private readonly couponService: CouponService,
    ) {}

    async createOrder(
        owner: OrderOwner,
        dto: CreateOrderDto,
        idempotencyKey: string | null,
    ): Promise<CreateOrderResult> {
        if (!owner.userId && !owner.sessionId) {
            throw new UnauthorizedException('Order owner could not be resolved');
        }

        if (!idempotencyKey) {
            throw new BadRequestException('X-Idempotency-Key header is required');
        }

        const existingOrder = await this.prisma.order.findUnique({
            where: {
                idempotencyKey,
            },
            include: {
                items: true,
                statusHistory: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        if (existingOrder) {
            return {
                order: existingOrder,
                isIdempotentReplay: true,
            };
        }

        const cart = await this.prisma.cart.findFirst({
            where: owner.userId
                ? {
                    userId: owner.userId,
                }
                : {
                    sessionId: owner.sessionId,
                },
            include: {
                items: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                    include: {
                        productVariant: {
                            include: {
                                product: {
                                    include: {
                                        category: true,
                                    },
                                },
                                size: true,
                                color: true,
                            },
                        },
                    },
                },
            },
        });

        if (!cart || cart.items.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        const deliverySnapshot = await this.resolveDeliverySnapshot(owner.userId, dto);

        const user = owner.userId
            ? await this.prisma.user.findUnique({
                where: {
                    id: owner.userId,
                },
                select: {
                    id: true,
                    personalDiscountPercent: true,
                },
            })
            : null;

        const personalDiscountPercent = user?.personalDiscountPercent ?? 0;

        const validatedItems = cart.items.map((item) => {
            const variant = item.productVariant;
            const product = variant.product;

            if (!variant.isActive || variant.deletedAt || !product.isActive || product.deletedAt) {
                throw new BadRequestException(`Product variant ${variant.id} is unavailable`);
            }

            const availableQty = Math.max(variant.stockQty - variant.reservedQty, 0);

            if (availableQty <= 0) {
                throw new BadRequestException(`Product variant ${variant.id} is out of stock`);
            }

            if (item.quantity > availableQty) {
                throw new BadRequestException(`Insufficient stock for product variant ${variant.id}`);
            }

            const salePrice = variant.price ?? product.basePrice;
            const purchaseCost = product.purchaseCost ?? 0;
            const lineRevenue = salePrice * item.quantity;
            const lineCost = purchaseCost * item.quantity;
            const lineProfit = lineRevenue - lineCost;

            return {
                productVariantId: variant.id,
                productName: product.name,
                categoryName: product.category?.name ?? null,
                productType: product.productType,
                sku: variant.sku,
                sizeName: variant.size?.name ?? null,
                colorName: variant.color?.name ?? null,
                salePrice,
                purchaseCost,
                quantity: item.quantity,
                lineRevenue,
                lineCost,
                lineProfit,
            };
        });

        const subtotal = validatedItems.reduce((sum, item) => sum + item.lineRevenue, 0);
        const totalCost = validatedItems.reduce((sum, item) => sum + item.lineCost, 0);

        // Промокод: валидируем под сумму корзины (бросает при невалидном).
        let couponDiscount = 0;
        let appliedCouponCode: string | null = null;
        if (dto.couponCode?.trim()) {
            const applied = await this.couponService.validate(dto.couponCode, subtotal);
            couponDiscount = applied.discountAmount;
            appliedCouponCode = applied.code;
        }

        const personalDiscount = Number(((subtotal * personalDiscountPercent) / 100).toFixed(2));
        const discountAmount = Number(Math.min(personalDiscount + couponDiscount, subtotal).toFixed(2));
        const deliveryAmount = 0;
        const totalAmount = Number((subtotal - discountAmount + deliveryAmount).toFixed(2));
        const grossProfit = Number((subtotal - totalCost).toFixed(2));
        const netProfit = Number((totalAmount - totalCost).toFixed(2));

        const order = await this.prisma.$transaction(async (transaction) => {
            const orderNumber = await this.generateOrderNumber(transaction);

            const createdOrder = await transaction.order.create({
                data: {
                    orderNumber,
                    userId: owner.userId,
                    customerName: dto.customerName,
                    customerPhone: dto.customerPhone,
                    customerEmail: dto.customerEmail ?? null,
                    deliveryProvider: deliverySnapshot.deliveryProvider,
                    city: deliverySnapshot.city,
                    warehouse: deliverySnapshot.warehouse,
                    addressLine: deliverySnapshot.addressLine,
                    postalCode: deliverySnapshot.postalCode,
                    deliveryComment: deliverySnapshot.deliveryComment,
                    status: OrderStatus.NEW,
                    subtotal,
                    discountAmount,
                    deliveryAmount,
                    totalAmount,
                    totalCost,
                    grossProfit,
                    netProfit,
                    utmSource: dto.utmSource ?? null,
                    utmMedium: dto.utmMedium ?? null,
                    utmCampaign: dto.utmCampaign ?? null,
                    utmContent: dto.utmContent ?? null,
                    utmTerm: dto.utmTerm ?? null,
                    referer: dto.referer ?? null,
                    personalDiscountPercent,
                    idempotencyKey,
                    couponCode: appliedCouponCode,
                    items: {
                        create: validatedItems.map((item) => ({
                            productVariantId: item.productVariantId,
                            productName: item.productName,
                            categoryName: item.categoryName,
                            productType: item.productType,
                            sku: item.sku,
                            sizeName: item.sizeName,
                            colorName: item.colorName,
                            salePrice: item.salePrice,
                            purchaseCost: item.purchaseCost,
                            quantity: item.quantity,
                            lineRevenue: item.lineRevenue,
                            lineCost: item.lineCost,
                            lineProfit: item.lineProfit,
                        })),
                    },
                    statusHistory: {
                        create: {
                            oldStatus: null,
                            newStatus: OrderStatus.NEW,
                        },
                    },
                },
                include: {
                    items: true,
                    statusHistory: {
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                },
            });

            for (const item of validatedItems) {
                // Атомарный резерв: инкремент только если доступного остатка хватает.
                // Условие внутри UPDATE защищает от oversell при параллельных заказах —
                // предварительная проверка выше даёт быстрый UX, а эта — гарантию.
                const reserved = await transaction.$executeRaw`
                    UPDATE "ProductVariant"
                    SET "reservedQty" = "reservedQty" + ${item.quantity}
                    WHERE "id" = ${item.productVariantId}
                      AND ("stockQty" - "reservedQty") >= ${item.quantity}
                `;
                if (reserved !== 1) {
                    throw new BadRequestException(
                        `Insufficient stock for product variant ${item.productVariantId}`,
                    );
                }
            }

            if (appliedCouponCode) {
                await this.couponService.redeem(transaction, appliedCouponCode);
            }

            await transaction.cartItem.deleteMany({
                where: {
                    cartId: cart.id,
                },
            });

            return createdOrder;
        });

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
        const normalizedFrontendUrl = frontendUrl.endsWith('/')
            ? frontendUrl.slice(0, -1)
            : frontendUrl;
        const adminLink = normalizedFrontendUrl
            ? `${normalizedFrontendUrl}/admin/orders/${order.id}`
            : `/admin/orders/${order.id}`;
        const deliveryParts = [
            order.deliveryProvider,
            order.city,
            order.warehouse,
            order.addressLine,
            order.postalCode,
        ].filter((value): value is string => Boolean(value && value.trim()));

        await this.telegramService.sendOrderNotification({
            orderNumber: order.orderNumber,
            amount: order.totalAmount,
            client: order.customerName,
            phone: order.customerPhone,
            delivery: deliveryParts.join(', ') || '-',
            adminLink,
        });

        if (order.customerEmail) {
            const currency =
                (await this.prisma.storeSettings.findFirst({ select: { currency: true } }))
                    ?.currency ?? 'UAH';
            await this.emailService.sendOrderConfirmationEmail({
                email: order.customerEmail,
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                currency,
            });
        }

        // Резерв изменил доступность вариантов — сбрасываем кэш каталога/карточек,
        // иначе витрина до 120с показывает устаревший availableQty.
        await this.cacheService.invalidateProduct();

        return {
            order,
            isIdempotentReplay: false,
        };
    }

    async getAdminOrders(query: AdminOrderQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const sort = query.sort ?? 'createdAt';
        const order = query.order ?? 'desc';
        const skip = (page - 1) * limit;

        const where: Prisma.OrderWhereInput = {
            status: query.status,
            userId: query.userId,
        };

        if (query.search) {
            where.OR = [
                {
                    orderNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                {
                    customerName: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                {
                    customerPhone: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
            ];
        }

        if (query.utmSource) {
            where.utmSource = {
                contains: query.utmSource,
                mode: 'insensitive',
            };
        }

        if (query.utmMedium) {
            where.utmMedium = {
                contains: query.utmMedium,
                mode: 'insensitive',
            };
        }

        if (query.utmCampaign) {
            where.utmCampaign = {
                contains: query.utmCampaign,
                mode: 'insensitive',
            };
        }

        if (query.utmContent) {
            where.utmContent = {
                contains: query.utmContent,
                mode: 'insensitive',
            };
        }

        if (query.utmTerm) {
            where.utmTerm = {
                contains: query.utmTerm,
                mode: 'insensitive',
            };
        }

        let createdAtFilter: Prisma.DateTimeFilter | undefined;

        if (query.dateFrom) {
            const dateFrom = new Date(query.dateFrom);
            if (Number.isNaN(dateFrom.getTime())) {
                throw new BadRequestException('Invalid dateFrom');
            }
            createdAtFilter = {
                ...(createdAtFilter ?? {}),
                gte: dateFrom,
            };
        }

        if (query.dateTo) {
            const dateTo = new Date(query.dateTo);
            if (Number.isNaN(dateTo.getTime())) {
                throw new BadRequestException('Invalid dateTo');
            }
            createdAtFilter = {
                ...(createdAtFilter ?? {}),
                lte: dateTo,
            };
        }

        if (createdAtFilter) {
            where.createdAt = createdAtFilter;
        }

        const [items, total] = await this.prisma.$transaction([
            this.prisma.order.findMany({
                where,
                orderBy: {
                    [sort]: order,
                },
                skip,
                take: limit,
                include: {
                    items: true,
                    statusHistory: {
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                },
            }),
            this.prisma.order.count({
                where,
            }),
        ]);

        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getAdminOrderById(id: number) {
        const order = await this.prisma.order.findUnique({
            where: {
                id,
            },
            include: {
                items: true,
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

        return order;
    }

    async updateOrderStatus(id: number, dto: UpdateOrderStatusDto) {
        const existingOrder = await this.prisma.order.findUnique({
            where: {
                id,
            },
            include: {
                items: true,
                statusHistory: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        if (!existingOrder) {
            throw new NotFoundException('Order not found');
        }

        if (existingOrder.status === dto.newStatus) {
            throw new BadRequestException('Order already has this status');
        }

        this.assertStatusTransition(existingOrder.status, dto.newStatus);

        const settings = await this.prisma.storeSettings.findFirst({
            select: {
                defaultLowStockThreshold: true,
            },
        });
        const lowStockThreshold = settings?.defaultLowStockThreshold ?? 3;
        const lowStockNotifications: LowStockNotificationItem[] = [];

        const updatedOrder = await this.prisma.$transaction(async (transaction) => {
            if (dto.newStatus === OrderStatus.DELIVERED) {
                for (const item of existingOrder.items) {
                    if (!item.productVariantId) {
                        continue;
                    }

                    const updatedVariant = await transaction.productVariant.update({
                        where: {
                            id: item.productVariantId,
                        },
                        data: {
                            reservedQty: {
                                decrement: item.quantity,
                            },
                            stockQty: {
                                decrement: item.quantity,
                            },
                        },
                        include: {
                            product: {
                                select: {
                                    name: true,
                                },
                            },
                            size: {
                                select: {
                                    name: true,
                                },
                            },
                            color: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    });

                    if (updatedVariant.stockQty <= lowStockThreshold) {
                        lowStockNotifications.push({
                            productName: updatedVariant.product.name,
                            sku: updatedVariant.sku,
                            size: updatedVariant.size?.name ?? undefined,
                            color: updatedVariant.color?.name ?? undefined,
                            stock: updatedVariant.stockQty,
                        });
                    }
                }
            }

            if (dto.newStatus === OrderStatus.CANCELLED) {
                for (const item of existingOrder.items) {
                    if (!item.productVariantId) {
                        continue;
                    }

                    await transaction.productVariant.update({
                        where: {
                            id: item.productVariantId,
                        },
                        data: {
                            reservedQty: {
                                decrement: item.quantity,
                            },
                        },
                    });
                }
            }

            if (dto.newStatus === OrderStatus.RETURNED) {
                for (const item of existingOrder.items) {
                    if (!item.productVariantId) {
                        continue;
                    }

                    await transaction.productVariant.update({
                        where: {
                            id: item.productVariantId,
                        },
                        data: {
                            stockQty: {
                                increment: item.quantity,
                            },
                        },
                    });
                }
            }

            await transaction.orderStatusHistory.create({
                data: {
                    orderId: existingOrder.id,
                    oldStatus: existingOrder.status,
                    newStatus: dto.newStatus,
                    note: dto.note ?? null,
                },
            });

            await transaction.order.update({
                where: {
                    id: existingOrder.id,
                },
                data: {
                    status: dto.newStatus,
                },
            });

            return transaction.order.findUniqueOrThrow({
                where: {
                    id: existingOrder.id,
                },
                include: {
                    items: true,
                    statusHistory: {
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                },
            });
        });

        await this.telegramService.sendStatusChangeNotification({
            orderNumber: updatedOrder.orderNumber,
            oldStatus: existingOrder.status,
            newStatus: updatedOrder.status,
        });

        if (updatedOrder.customerEmail) {
            await this.emailService.sendOrderStatusEmail({
                email: updatedOrder.customerEmail,
                orderNumber: updatedOrder.orderNumber,
                newStatus: updatedOrder.status,
            });
        }

        for (const notification of lowStockNotifications) {
            await this.telegramService.sendLowStockNotification(notification);
        }

        const stockStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.RETURNED];
        const stockChanged = stockStatuses.includes(dto.newStatus);
        if (stockChanged) {
            await this.cacheService.invalidateProduct();
        }

        if (dto.newStatus === OrderStatus.DELIVERED) {
            await this.cacheService.invalidateRelated();
        }

        return updatedOrder;
    }

    async updateAdminOrder(id: number, dto: UpdateOrderDto) {
        const existingOrder = await this.prisma.order.findUnique({
            where: {
                id,
            },
        });

        if (!existingOrder) {
            throw new NotFoundException('Order not found');
        }

        return this.prisma.order.update({
            where: {
                id,
            },
            data: {
                internalComment: dto.internalComment ?? null,
                trackingNumber: dto.trackingNumber ?? undefined,
            },
            include: {
                items: true,
                statusHistory: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });
    }

    async createTtn(id: number) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            select: {
                id: true, orderNumber: true, customerName: true, customerPhone: true,
                city: true, warehouse: true, totalAmount: true, trackingNumber: true,
            },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.trackingNumber) throw new BadRequestException('ТТН вже створено для цього замовлення.');
        if (!order.city || !order.warehouse) {
            throw new BadRequestException('У замовленні немає міста або відділення Nova Poshta.');
        }

        const { ttn } = await this.deliveryService.createInternetDocument({
            recipientName: order.customerName,
            recipientPhone: order.customerPhone,
            cityName: order.city,
            warehouseName: order.warehouse,
            cost: order.totalAmount,
            description: `Замовлення ${order.orderNumber}`,
        });

        return this.prisma.order.update({
            where: { id },
            data: { trackingNumber: ttn },
            include: {
                items: true,
                statusHistory: { orderBy: { createdAt: 'asc' } },
            },
        });
    }

    async getOrderTracking(id: number, userId?: number) {
        const order = await this.prisma.order.findFirst({
            where: { id, ...(userId ? { userId } : {}) },
            select: { id: true, trackingNumber: true, status: true },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (!order.trackingNumber) {
            return null;
        }

        const tracking = await this.deliveryService.getTrackingInfo(order.trackingNumber);
        if (!tracking) return null;

        const statusChanged = await this.applyNovaPoshtaStatus(order, tracking.statusCode);
        const refreshed = statusChanged
            ? await this.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } })
            : order;

        return {
            ...tracking,
            orderStatus: refreshed.status,
            statusChanged,
        };
    }

    async syncNovaPoshtaStatuses(): Promise<{ checked: number; updated: number }> {
        const orders = await this.prisma.order.findMany({
            where: {
                trackingNumber: { not: null },
                status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
            },
            select: { id: true, trackingNumber: true, status: true },
        });

        const trackingNumbers = orders.map((order) => order.trackingNumber).filter((value): value is string => Boolean(value));
        const trackingList = await this.deliveryService.getMultipleTrackingInfo(trackingNumbers);
        const trackingByNumber = new Map(trackingList.map((item) => [item.ttn, item]));
        let updated = 0;

        for (const order of orders) {
            if (!order.trackingNumber) continue;
            const tracking = trackingByNumber.get(order.trackingNumber);
            if (!tracking) continue;
            if (await this.applyNovaPoshtaStatus(order, tracking.statusCode)) updated += 1;
        }

        return { checked: orders.length, updated };
    }

    private async applyNovaPoshtaStatus(
        order: { id: number; status: OrderStatus },
        novaPoshtaStatusCode: string,
    ): Promise<boolean> {
        const mapped = this.deliveryService.mapNovaPoshtaStatusToOrderStatus(novaPoshtaStatusCode);
        if (!mapped || mapped === order.status) return false;

        const allowed =
            (order.status === OrderStatus.PROCESSING && mapped === OrderStatus.SHIPPED)
            || (order.status === OrderStatus.SHIPPED && (mapped === OrderStatus.DELIVERED || mapped === OrderStatus.RETURNED))
            || (order.status === OrderStatus.DELIVERED && mapped === OrderStatus.RETURNED);
        if (!allowed) return false;

        await this.updateOrderStatus(order.id, {
            newStatus: mapped,
            note: `Автоматично синхронізовано з Новою поштою (код ${novaPoshtaStatusCode})`,
        });
        return true;
    }

    private async resolveDeliverySnapshot(
        userId: number | null,
        dto: CreateOrderDto,
    ): Promise<DeliverySnapshot> {
        if (dto.deliveryProfileId) {
            if (!userId) {
                throw new UnauthorizedException('Delivery profile is available only for authorized users');
            }

            const deliveryProfile = await this.prisma.userDeliveryProfile.findFirst({
                where: {
                    id: dto.deliveryProfileId,
                    userId,
                },
            });

            if (!deliveryProfile) {
                throw new NotFoundException('Delivery profile not found');
            }

            return {
                deliveryProvider: deliveryProfile.deliveryProvider,
                city: deliveryProfile.city,
                warehouse: deliveryProfile.warehouse ?? null,
                addressLine: deliveryProfile.addressLine ?? null,
                postalCode: deliveryProfile.postalCode ?? null,
                deliveryComment: deliveryProfile.comment ?? dto.comment ?? null,
            };
        }

        if (!dto.deliveryProvider) {
            throw new BadRequestException(
                'Delivery data is required when deliveryProfileId is not provided',
            );
        }

        if (dto.deliveryProvider === 'NOVA_POSHTA' && (!dto.city || !dto.warehouse)) {
            throw new BadRequestException('City and warehouse are required for Nova Poshta delivery');
        }

        if (dto.deliveryProvider === 'COURIER' && !dto.addressLine) {
            throw new BadRequestException('Address is required for courier delivery');
        }

        return {
            deliveryProvider: dto.deliveryProvider,
            city: dto.city ?? null,
            warehouse: dto.warehouse ?? null,
            addressLine: dto.addressLine ?? null,
            postalCode: dto.postalCode ?? null,
            deliveryComment: dto.comment ?? null,
        };
    }

    private assertStatusTransition(currentStatus: OrderStatus, nextStatus: OrderStatus) {
        const transitions: Record<OrderStatus, StatusTransitionRule> = {
            [OrderStatus.NEW]: {
                allowedNextStatuses: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
                adjustInventory: false,
            },
            [OrderStatus.PROCESSING]: {
                allowedNextStatuses: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
                adjustInventory: false,
            },
            [OrderStatus.SHIPPED]: {
                allowedNextStatuses: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
                adjustInventory: true,
            },
            [OrderStatus.DELIVERED]: {
                allowedNextStatuses: [OrderStatus.RETURNED],
                adjustInventory: true,
            },
            [OrderStatus.CANCELLED]: {
                allowedNextStatuses: [],
                adjustInventory: false,
            },
            [OrderStatus.RETURNED]: {
                allowedNextStatuses: [],
                adjustInventory: false,
            },
        };

        const rule = transitions[currentStatus];

        if (!rule.allowedNextStatuses.includes(nextStatus)) {
            throw new BadRequestException(
                `Invalid status transition from ${currentStatus} to ${nextStatus}`,
            );
        }
    }

    private async generateOrderNumber(transaction: Prisma.TransactionClient): Promise<string> {
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = `${now.getMonth() + 1}`.padStart(2, '0');
        const day = `${now.getDate()}`.padStart(2, '0');
        const datePart = `${year}${month}${day}`;

        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const ordersTodayCount = await transaction.order.count({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });

        const sequence = `${ordersTodayCount + 1}`.padStart(5, '0');

        return `ORD-${datePart}-${sequence}`;
    }
}
