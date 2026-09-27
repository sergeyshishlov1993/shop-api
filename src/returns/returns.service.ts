import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ExpenseType,
  FileType,
  OrderStatus,
  Prisma,
  ReturnStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { FileRecord, loadVariantImages } from '../common/utils/variant-image';
import { CacheService } from '../cache/cache.service';
import { StockNotificationService } from '../stock-notification/stock-notification.service';
import { EmailService } from '../email/email.service';
import { FileService } from '../file/file.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryAdminReturnsDto } from './dto/query-admin-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

const INACTIVE_STATUSES: ReturnStatus[] = [ReturnStatus.REJECTED, ReturnStatus.CANCELLED];

const ALLOWED_TRANSITIONS: Partial<Record<ReturnStatus, ReturnStatus[]>> = {
  NEW: [ReturnStatus.UNDER_REVIEW, ReturnStatus.REJECTED],
  UNDER_REVIEW: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
  APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
  // APPROVED з RECEIVED — відкат помилково проставленого «Отримано» (залишки списуються назад)
  RECEIVED: [ReturnStatus.REFUNDED, ReturnStatus.REJECTED, ReturnStatus.APPROVED],
};

const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_RETURN_WINDOW_DAYS = 14;

const FILE_SELECT = {
  id: true,
  s3Key: true,
  s3KeyThumb: true,
  s3KeyMedium: true,
  s3KeyLarge: true,
} as const;

const RETURN_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
    },
  },
  user: { select: { email: true } },
  items: { orderBy: { id: 'asc' }, include: { orderItem: true } },
  photos: { orderBy: { id: 'asc' }, include: { file: { select: FILE_SELECT } } },
  history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ReturnRequestInclude;

type ReturnWithRelations = Prisma.ReturnRequestGetPayload<{ include: typeof RETURN_INCLUDE }>;

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileService: FileService,
    private readonly emailService: EmailService,
    private readonly cacheService: CacheService,
    private readonly stockNotificationService: StockNotificationService,
  ) {}

  // ─── Storefront ───

  async findMine(userId: number) {
    await this.assertEnabled();
    const returns = await this.prisma.returnRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: RETURN_INCLUDE,
    });
    const images = await this.loadImages(returns);
    return returns.map((r) => this.toSummary(r, images));
  }

  async findMineById(userId: number, id: number) {
    await this.assertEnabled();
    const request = await this.prisma.returnRequest.findFirst({
      where: { id, userId },
      include: RETURN_INCLUDE,
    });
    if (!request) throw new NotFoundException('Заявку на повернення не знайдено');
    return this.toDetail(request, await this.loadImages([request]), true);
  }

  async getEligibility(userId: number, orderId: number, tx?: Prisma.TransactionClient) {
    await this.assertEnabled();
    const db = tx ?? this.prisma;
    const order = await db.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: { orderBy: { id: 'asc' } },
        statusHistory: {
          where: { newStatus: OrderStatus.DELIVERED },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!order) throw new NotFoundException('Замовлення не знайдено');

    const requested = await this.getRequestedQuantities(order.items.map((i) => i.id), db);
    const images = await loadVariantImages(
      this.prisma,
      order.items.map((i) => i.productVariantId),
    );

    const items = order.items.map((item) => ({
      orderItemId: item.id,
      productName: item.productName,
      sizeName: item.sizeName,
      colorName: item.colorName,
      quantity: item.quantity,
      returnableQty: Math.max(item.quantity - (requested.get(item.id) ?? 0), 0),
      unitPrice: item.salePrice,
      image: item.productVariantId ? images.get(item.productVariantId) ?? null : null,
    }));

    let reason: string | null = null;
    let deadline: Date | null = null;

    if (order.status !== OrderStatus.DELIVERED) {
      reason = 'Повернення можливе лише для доставлених замовлень';
    } else {
      const windowDays = await this.getReturnWindowDays();
      const deliveredAt = order.statusHistory[0]?.createdAt ?? order.updatedAt;
      deadline = new Date(deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
      if (deadline.getTime() < Date.now()) {
        reason = `Термін повернення (${windowDays} днів з моменту доставки) минув`;
      } else if (items.every((i) => i.returnableQty === 0)) {
        reason = 'Усі товари з цього замовлення вже оформлені на повернення';
      }
    }

    return {
      eligible: reason === null,
      reason,
      deadline: deadline ? deadline.toISOString() : null,
      items,
    };
  }

  async create(userId: number, dto: CreateReturnDto) {
    await this.assertEnabled();

    const photoFileIds = [...new Set(dto.photoFileIds ?? [])];
    if (photoFileIds.length > 0) {
      const files = await this.prisma.fileAsset.findMany({
        where: { id: { in: photoFileIds }, fileType: FileType.IMAGE },
        select: { id: true },
      });
      if (files.length !== photoFileIds.length) {
        throw new BadRequestException('Фото не знайдено');
      }
    }

    const created = await this.createWithUniqueNumber((number) =>
      this.prisma.$transaction(async (tx) => {
        // Serialize return-quantity checks for the same order until its request is inserted.
        const lockedOrders = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT "id" FROM "Order"
          WHERE "id" = ${dto.orderId} AND "userId" = ${userId}
          FOR UPDATE
        `;
        if (lockedOrders.length === 0) throw new NotFoundException('Замовлення не знайдено');

        const eligibility = await this.getEligibility(userId, dto.orderId, tx);
        if (!eligibility.eligible) throw new BadRequestException(eligibility.reason);

        const seen = new Set<number>();
        for (const item of dto.items) {
          if (seen.has(item.orderItemId)) {
            throw new BadRequestException('Позиції в заявці не повинні повторюватися');
          }
          seen.add(item.orderItemId);
          const orderItem = eligibility.items.find((i) => i.orderItemId === item.orderItemId);
          if (!orderItem) {
            throw new BadRequestException(`Позиція ${item.orderItemId} не належить цьому замовленню`);
          }
          if (item.quantity > orderItem.returnableQty) {
            throw new BadRequestException(
              `Для «${orderItem.productName}» можна повернути не більше ${orderItem.returnableQty} шт.`,
            );
          }
        }

        return tx.returnRequest.create({
          data: {
            number,
            orderId: dto.orderId,
            userId,
            reason: dto.reason,
            comment: dto.comment?.trim() || null,
            refundDetails: dto.refundDetails.trim(),
            items: {
              create: dto.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
            },
            photos: { create: photoFileIds.map((fileId) => ({ fileId })) },
            history: { create: { status: ReturnStatus.NEW, byAdmin: false } },
          },
          include: RETURN_INCLUDE,
        });
      }),
    );

    const email = created.order.customerEmail ?? created.user.email;
    if (email) {
      await this.emailService
        .sendReturnCreatedEmail({
          email,
          returnNumber: created.number,
          orderNumber: created.order.orderNumber,
        })
        .catch((error) => this.logger.error('Return created email failed', error as Error));
    }

    return this.toDetail(created, await this.loadImages([created]), true);
  }

  async uploadPhoto(file?: Express.Multer.File) {
    await this.assertEnabled();
    if (!file) throw new BadRequestException('Файл обовʼязковий');
    if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Фото має бути у форматі JPEG, PNG або WebP');
    }
    if (file.size > PHOTO_MAX_SIZE) {
      throw new BadRequestException('Розмір фото не повинен перевищувати 10 МБ');
    }
    const uploaded = await this.fileService.upload(file);
    return { id: uploaded.id, url: uploaded.url };
  }

  async cancel(userId: number, id: number) {
    await this.assertEnabled();
    const request = await this.prisma.returnRequest.findFirst({ where: { id, userId } });
    if (!request) throw new NotFoundException('Заявку на повернення не знайдено');
    if (request.status !== ReturnStatus.NEW) {
      throw new BadRequestException('Скасувати можна лише нову заявку');
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnStatus.CANCELLED,
        history: {
          create: { status: ReturnStatus.CANCELLED, comment: 'Скасовано клієнтом', byAdmin: false },
        },
      },
      include: RETURN_INCLUDE,
    });
    await this.notifyStatus(updated, null);
    return this.toDetail(updated, await this.loadImages([updated]), true);
  }

  async updateTracking(userId: number, id: number, trackingNumber: string) {
    await this.assertEnabled();
    const request = await this.prisma.returnRequest.findFirst({ where: { id, userId } });
    if (!request) throw new NotFoundException('Заявку на повернення не знайдено');
    if (request.status !== ReturnStatus.APPROVED) {
      throw new BadRequestException('ТТН можна вказати лише для схваленої заявки');
    }

    const value = trackingNumber.trim();
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        trackingNumber: value,
        history: {
          create: { status: request.status, comment: `Клієнт вказав ТТН: ${value}`, byAdmin: false },
        },
      },
      include: RETURN_INCLUDE,
    });
    return this.toDetail(updated, await this.loadImages([updated]), true);
  }

  // ─── Admin ───

  async findAllAdmin(query: QueryAdminReturnsDto) {
    const where: Prisma.ReturnRequestWhereInput = {};
    if (query.status) where.status = query.status;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { customerPhone: { contains: search } } },
        { order: { customerName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: RETURN_INCLUDE,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    const images = await this.loadImages(rows);

    return {
      items: rows.map((r) => ({ ...this.toSummary(r, images), customer: this.toCustomer(r) })),
      totalCount,
      page: query.page,
      limit: query.limit,
    };
  }

  async getStats() {
    const [newCount, underReview] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where: { status: ReturnStatus.NEW } }),
      this.prisma.returnRequest.count({ where: { status: ReturnStatus.UNDER_REVIEW } }),
    ]);
    return { new: newCount, underReview };
  }

  async findOneAdmin(id: number) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: RETURN_INCLUDE,
    });
    if (!request) throw new NotFoundException('Заявку на повернення не знайдено');
    return this.toDetail(request, await this.loadImages([request]), false);
  }

  async updateStatus(id: number, dto: UpdateReturnStatusDto) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: { include: { items: true } }, items: true },
    });
    if (!request) throw new NotFoundException('Заявку на повернення не знайдено');

    const managerComment = dto.managerComment !== undefined ? dto.managerComment.trim() || null : undefined;

    // Той самий статус — лише оновлення внутрішнього коментаря менеджера.
    if (dto.status === request.status) {
      if (managerComment === undefined) {
        throw new BadRequestException('Заявка вже має цей статус');
      }
      await this.prisma.returnRequest.update({ where: { id }, data: { managerComment } });
      return this.findOneAdmin(id);
    }

    if (!ALLOWED_TRANSITIONS[request.status]?.includes(dto.status)) {
      throw new BadRequestException(`Недопустимий перехід статусу: ${request.status} → ${dto.status}`);
    }

    const rejectReason = dto.rejectReason?.trim();
    if (dto.status === ReturnStatus.REJECTED && !rejectReason) {
      throw new BadRequestException('Для відхилення потрібно вказати причину');
    }
    if (dto.status === ReturnStatus.REFUNDED && !(dto.refundAmount && dto.refundAmount > 0)) {
      throw new BadRequestException('Для статусу «Гроші повернено» потрібна сума повернення більше 0');
    }

    const comment = dto.comment?.trim() || (dto.status === ReturnStatus.REJECTED ? rejectReason : null) || null;

    const restockedProducts = new Map<number, string>();
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.returnRequest.updateMany({
        where: { id, status: request.status },
        data: {
          status: dto.status,
          ...(managerComment !== undefined && { managerComment }),
          ...(dto.status === ReturnStatus.REJECTED && { rejectReason }),
          ...(dto.status === ReturnStatus.REFUNDED && { refundAmount: dto.refundAmount }),
        },
      });
      if (transition.count !== 1) {
        throw new BadRequestException('Статус заявки вже змінено; оновіть сторінку');
      }
      await tx.returnStatusHistory.create({
        data: { returnRequestId: id, status: dto.status, comment, byAdmin: true },
      });
      const result = await tx.returnRequest.findUniqueOrThrow({ where: { id }, include: RETURN_INCLUDE });

      // Посилку отримано на складі — повертаємо залишки варіантів (кількість із заявки).
      // Вихід зі статусу «Отримано» назад у «Схвалено» або у «Відхилено» (товар повертаємо клієнту) — списуємо їх назад.
      const stockDelta = dto.status === ReturnStatus.RECEIVED ? 1
        : request.status === ReturnStatus.RECEIVED && (dto.status === ReturnStatus.APPROVED || dto.status === ReturnStatus.REJECTED) ? -1
          : 0;
      if (stockDelta !== 0) {
        for (const line of request.items) {
          const orderItem = request.order.items.find(item => item.id === line.orderItemId);
          if (!orderItem?.productVariantId) continue;
          const current = await tx.productVariant.findUnique({ where: { id: orderItem.productVariantId }, select: { stockQty: true } });
          if (!current) continue;
          const variant = await tx.productVariant.update({
            where: { id: orderItem.productVariantId },
            // ponytail: при відкаті не йдемо нижче 0 — якщо товар уже продали, залишок просто обнулиться
            data: { stockQty: Math.max(0, current.stockQty + stockDelta * line.quantity) },
            select: { productId: true, product: { select: { slug: true } } },
          });
          restockedProducts.set(variant.productId, variant.product.slug);
        }
      }

      if (dto.status === ReturnStatus.REFUNDED) {
        await tx.expense.create({
          data: {
            title: `Повернення ${request.number}`,
            type: ExpenseType.RETURN,
            amount: dto.refundAmount!,
            expenseDate: new Date(),
            note: `Замовлення ${result.order.orderNumber}`,
          },
        });
        await this.markOrderReturnedIfComplete(tx, request.order, request.number);
      }

      return result;
    });

    // Після повернення на склад: скинути кеш товарів і повідомити підписників «зʼявився в наявності» (не фатально)
    for (const [productId, slug] of restockedProducts) {
      await this.cacheService.invalidateProduct(slug).catch(() => undefined);
      if (dto.status === ReturnStatus.RECEIVED) {
        await this.stockNotificationService.notifyBackInStock(productId).catch(() => undefined);
      }
    }

    await this.notifyStatus(updated, dto.status === ReturnStatus.REJECTED ? rejectReason ?? null : dto.comment ?? null);
    return this.toDetail(updated, await this.loadImages([updated]), false);
  }

  // ─── Helpers ───

  private async markOrderReturnedIfComplete(
    tx: Prisma.TransactionClient,
    order: { id: number; status: OrderStatus; items: Array<{ id: number; quantity: number }> },
    returnNumber: string,
  ) {
    if (order.status === OrderStatus.RETURNED) return;

    const refunded = await tx.returnRequestItem.groupBy({
      by: ['orderItemId'],
      where: {
        orderItemId: { in: order.items.map((i) => i.id) },
        returnRequest: { status: ReturnStatus.REFUNDED },
      },
      _sum: { quantity: true },
    });
    const refundedMap = new Map(refunded.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
    if (!order.items.every((i) => (refundedMap.get(i.id) ?? 0) >= i.quantity)) return;

    await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.RETURNED } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: order.status,
        newStatus: OrderStatus.RETURNED,
        note: `Повне повернення ${returnNumber}`,
      },
    });
  }

  private async getRequestedQuantities(
    orderItemIds: number[],
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rows = await db.returnRequestItem.groupBy({
      by: ['orderItemId'],
      where: {
        orderItemId: { in: orderItemIds },
        returnRequest: { status: { notIn: INACTIVE_STATUSES } },
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
  }

  private async getReturnWindowDays() {
    const settings = await this.prisma.storeSettings.findFirst({ select: { returnWindowDays: true } });
    return settings?.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS;
  }

  /** RET-YYYYMMDD-NNNN; при колізії унікального номера пробуємо наступний. */
  private async createWithUniqueNumber<T>(create: (number: string) => Promise<T>): Promise<T> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(2, '0')}${`${now.getDate()}`.padStart(2, '0')}`;
    const prefix = `RET-${datePart}-`;

    const last = await this.prisma.returnRequest.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let sequence = last ? Number(last.number.slice(prefix.length)) + 1 : 1;

    for (let attempt = 0; attempt < 5; attempt++, sequence++) {
      try {
        return await create(`${prefix}${`${sequence}`.padStart(4, '0')}`);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    throw new BadRequestException('Не вдалося згенерувати номер заявки, спробуйте ще раз');
  }

  private async notifyStatus(request: ReturnWithRelations, comment: string | null) {
    const email = request.order.customerEmail ?? request.user.email;
    if (!email) return;
    await this.emailService
      .sendReturnStatusEmail({
        email,
        returnNumber: request.number,
        newStatus: request.status,
        comment,
      })
      .catch((error) => this.logger.error('Return status email failed', error as Error));
  }

  private loadImages(requests: ReturnWithRelations[]) {
    return loadVariantImages(
      this.prisma,
      requests.flatMap((r) => r.items.map((i) => i.orderItem.productVariantId)),
    );
  }

  private toSummary(r: ReturnWithRelations, images: Map<number, FileRecord | null>) {
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      refundAmount: r.refundAmount,
      order: { id: r.order.id, orderNumber: r.order.orderNumber },
      items: r.items.map((i) => ({
        id: i.id,
        orderItemId: i.orderItemId,
        productName: i.orderItem.productName,
        sizeName: i.orderItem.sizeName,
        colorName: i.orderItem.colorName,
        quantity: i.quantity,
        unitPrice: i.orderItem.salePrice,
        image: i.orderItem.productVariantId ? images.get(i.orderItem.productVariantId) ?? null : null,
      })),
    };
  }

  private toDetail(r: ReturnWithRelations, images: Map<number, FileRecord | null>, mask: boolean) {
    return {
      ...this.toSummary(r, images),
      comment: r.comment,
      refundDetails: mask ? maskRefundDetails(r.refundDetails) : r.refundDetails,
      trackingNumber: r.trackingNumber,
      managerComment: r.managerComment,
      rejectReason: r.rejectReason,
      photos: r.photos.map((p) => p.file),
      history: r.history.map((h) => ({
        id: h.id,
        status: h.status,
        comment: h.comment,
        createdAt: h.createdAt,
        byAdmin: h.byAdmin,
      })),
      customer: this.toCustomer(r),
    };
  }

  private toCustomer(r: ReturnWithRelations) {
    return {
      name: r.order.customerName,
      email: r.order.customerEmail ?? r.user.email ?? null,
      phone: r.order.customerPhone,
    };
  }

  // Повернення вимкнені в налаштуваннях адмінки — клієнтські дії недоступні
  private async assertEnabled() {
    const settings = await this.prisma.storeSettings.findFirst({ select: { returnsEnabled: true } });
    if (settings && !settings.returnsEnabled) {
      throw new ForbiddenException('Повернення зараз недоступні');
    }
  }
}

function maskRefundDetails(value: string): string {
  const compact = value.replace(/\s+/g, '');
  return compact.length <= 4 ? compact : `•••• ${compact.slice(-4)}`;
}
