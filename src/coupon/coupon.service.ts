import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Coupon, CouponDiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

export type CouponValidationResult = {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  discountAmount: number;
};

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(code: string): string {
    return code.trim().toUpperCase();
  }

  private computeDiscount(coupon: Pick<Coupon, 'discountType' | 'discountValue'>, subtotal: number): number {
    const raw =
      coupon.discountType === 'PERCENT'
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
    return Number(Math.max(0, Math.min(raw, subtotal)).toFixed(2));
  }

  /** Проверяет промокод под сумму корзины. Бросает при невалидном. */
  async validate(code: string, subtotal: number): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: this.normalize(code) } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Промокод недійсний.');
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      throw new BadRequestException('Термін дії промокоду минув.');
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
      throw new BadRequestException('Ліміт використань промокоду вичерпано.');
    if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal)
      throw new BadRequestException(`Мінімальна сума замовлення — ${coupon.minSubtotal}.`);

    return {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: this.computeDiscount(coupon, subtotal),
    };
  }

  /** Списывает использование внутри транзакции заказа. */
  async redeem(tx: Prisma.TransactionClient, code: string): Promise<void> {
    await tx.coupon.update({
      where: { code: this.normalize(code) },
      data: { usedCount: { increment: 1 } },
    });
  }

  // ─── Admin CRUD ───

  list(): Promise<Coupon[]> {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: CreateCouponDto): Promise<Coupon> {
    return this.prisma.coupon.create({
      data: {
        ...dto,
        code: this.normalize(dto.code),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async update(id: number, dto: UpdateCouponDto): Promise<Coupon> {
    await this.getOrThrow(id);
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.code ? { code: this.normalize(dto.code) } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
      },
    });
  }

  async remove(id: number): Promise<{ success: true }> {
    await this.getOrThrow(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  private async getOrThrow(id: number): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Промокод не знайдено.');
    return coupon;
  }
}
