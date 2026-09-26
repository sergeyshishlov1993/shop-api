import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { hashToken } from '../auth/token-hash';
import { AccountService } from './account.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const hash = bcrypt.hash as unknown as jest.Mock;
const compare = bcrypt.compare as unknown as jest.Mock;

describe('AccountService.changePassword', () => {
  let prisma: any;
  let service: AccountService;

  beforeEach(() => {
    hash.mockReset().mockImplementation(async (v: string) => `hashed:${v}`);
    compare.mockReset();
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1, passwordHash: 'H' }), update: jest.fn() },
      refreshSession: { updateMany: jest.fn() },
    };
    service = new AccountService(prisma, {} as any, {} as any);
  });

  it('rejects wrong current password', async () => {
    compare.mockResolvedValue(false);
    await expect(service.changePassword(1, 'bad', 'newpass1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('hashes new password and revokes other sessions', async () => {
    compare.mockResolvedValue(true);
    await service.changePassword(1, 'old', 'newpass1', 'cur');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { passwordHash: 'hashed:newpass1' } });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null, tokenHash: { not: hashToken('cur') } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes all sessions when no current token', async () => {
    compare.mockResolvedValue(true);
    await service.changePassword(1, 'old', 'newpass1');
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
