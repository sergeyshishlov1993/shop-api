import { StorefrontService } from './storefront.service';

describe('Storefront catalog filter by promo block (CUSTOM collection)', () => {
  const where = (dto: object) => (new StorefrontService({} as any) as any).buildBaseWhere(dto, undefined);

  it('?promo=<id> limits products to that promo block', () => {
    expect(where({ promo: 7 }).promoProducts).toEqual({ some: { promoBlockId: 7 } });
  });

  it('no promo — no promo condition', () => {
    expect(where({}).promoProducts).toBeUndefined();
  });
});
