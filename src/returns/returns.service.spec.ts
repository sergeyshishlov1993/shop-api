import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { ReturnsService } from './returns.service';

describe('ReturnsService.updateStatus', () => {
  it('does not apply stock effects when another request already changed the status', async () => {
    const request = {
      status: ReturnStatus.APPROVED,
      number: 'RET-20260927-0001',
      items: [],
      order: { id: 7, status: OrderStatus.DELIVERED, items: [] },
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const productVariantUpdate = jest.fn();
    const tx = {
      returnRequest: { updateMany },
      returnStatusHistory: { create: jest.fn() },
      productVariant: { update: productVariantUpdate },
    };
    const prisma = {
      returnRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      $transaction: (work: (transaction: typeof tx) => unknown) => work(tx),
    };
    const service = new ReturnsService(prisma as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.updateStatus(2, { status: ReturnStatus.RECEIVED })).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 2, status: ReturnStatus.APPROVED },
      data: { status: ReturnStatus.RECEIVED },
    });
    expect(productVariantUpdate).not.toHaveBeenCalled();
  });
});

describe('ReturnsService.create', () => {
  it('locks the order before checking returnable quantities', async () => {
    const events: string[] = [];
    const createReturn = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => {
        events.push('lock');
        return [{ id: 7 }];
      }),
      returnRequest: { create: createReturn },
    };
    const prisma = {
      storeSettings: { findFirst: jest.fn().mockResolvedValue({ returnsEnabled: true }) },
      returnRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: (work: (transaction: typeof tx) => unknown) => work(tx),
    };
    const service = new ReturnsService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'getEligibility').mockImplementation(async () => {
      events.push('eligibility');
      return { eligible: false, reason: 'No remaining quantity', items: [] } as any;
    });

    await expect(service.create(1, {
      orderId: 7,
      items: [{ orderItemId: 11, quantity: 1 }],
      reason: 'OTHER' as any,
      refundDetails: 'UA1234567890',
    })).rejects.toThrow('No remaining quantity');

    expect(events).toEqual(['lock', 'eligibility']);
    expect(createReturn).not.toHaveBeenCalled();
  });
});
