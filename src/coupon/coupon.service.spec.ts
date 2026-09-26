import { BadRequestException } from '@nestjs/common';
import { CouponService } from './coupon.service';

describe('CouponService.validate', () => {
  const findUnique = jest.fn();
  const service = new CouponService({ coupon: { findUnique } } as any);

  const coupon = (over: Record<string, unknown> = {}) => ({
    code: 'SALE10',
    isActive: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minSubtotal: null,
    discountType: 'PERCENT',
    discountValue: 10,
    ...over,
  });

  beforeEach(() => findUnique.mockReset());

  it('normalizes code before lookup', async () => {
    findUnique.mockResolvedValue(coupon());
    await service.validate('  sale10 ', 100);
    expect(findUnique).toHaveBeenCalledWith({ where: { code: 'SALE10' } });
  });

  it('rejects missing coupon', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.validate('X', 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive coupon', async () => {
    findUnique.mockResolvedValue(coupon({ isActive: false }));
    await expect(service.validate('SALE10', 100)).rejects.toThrow('недійсний');
  });

  it('rejects expired coupon', async () => {
    findUnique.mockResolvedValue(coupon({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.validate('SALE10', 100)).rejects.toThrow('минув');
  });

  it('accepts coupon with future expiry', async () => {
    findUnique.mockResolvedValue(coupon({ expiresAt: new Date(Date.now() + 60_000) }));
    await expect(service.validate('SALE10', 100)).resolves.toMatchObject({ discountAmount: 10 });
  });

  it('rejects when usage limit reached', async () => {
    findUnique.mockResolvedValue(coupon({ maxUses: 5, usedCount: 5 }));
    await expect(service.validate('SALE10', 100)).rejects.toThrow('Ліміт');
  });

  it('rejects when subtotal below minimum', async () => {
    findUnique.mockResolvedValue(coupon({ minSubtotal: 500 }));
    await expect(service.validate('SALE10', 499)).rejects.toThrow('500');
  });

  it('accepts subtotal equal to minimum', async () => {
    findUnique.mockResolvedValue(coupon({ minSubtotal: 500 }));
    await expect(service.validate('SALE10', 500)).resolves.toMatchObject({ discountAmount: 50 });
  });

  it('computes percent discount rounded to 2 decimals', async () => {
    findUnique.mockResolvedValue(coupon({ discountValue: 15 }));
    const res = await service.validate('SALE10', 33.33);
    expect(res).toEqual({ code: 'SALE10', discountType: 'PERCENT', discountValue: 15, discountAmount: 5 });
  });

  it('computes fixed discount', async () => {
    findUnique.mockResolvedValue(coupon({ discountType: 'FIXED', discountValue: 70 }));
    expect((await service.validate('SALE10', 200)).discountAmount).toBe(70);
  });

  it('caps fixed discount at subtotal', async () => {
    findUnique.mockResolvedValue(coupon({ discountType: 'FIXED', discountValue: 300 }));
    expect((await service.validate('SALE10', 200)).discountAmount).toBe(200);
  });
});

describe('CouponService.redeem', () => {
  const tx = (affected: number) => ({ $executeRaw: jest.fn().mockResolvedValue(affected) });

  it('atomically increments usedCount guarded by maxUses', async () => {
    const client = tx(1);
    await new CouponService({} as any).redeem(client as any, ' sale10');
    const [sql, ...values] = client.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/"usedCount" = "usedCount" \+ 1[\s\S]*"maxUses" IS NULL OR "usedCount" < "maxUses"/);
    expect(values).toEqual(['SALE10']);
  });

  it('throws when limit already reached (concurrent order took the last use)', async () => {
    await expect(new CouponService({} as any).redeem(tx(0) as any, 'SALE10')).rejects.toThrow('Ліміт використань');
  });
});
