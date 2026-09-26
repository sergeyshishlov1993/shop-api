import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const hash = bcrypt.hash as unknown as jest.Mock;
const compare = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let cart: any;
  let service: AuthService;

  const user = { id: 1, email: 'a@b.c', role: 'CUSTOMER', isActive: true, passwordHash: 'H' };

  beforeEach(() => {
    hash.mockReset().mockImplementation(async (v: string) => `hashed:${v}`);
    compare.mockReset();
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
      refreshSession: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('access.jwt') };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
      get: jest.fn((_k: string, d?: string) => d),
    };
    cart = { mergeGuestCartToUser: jest.fn() };
    service = new AuthService(prisma, jwt, config as any, {} as any, cart);
  });

  describe('register', () => {
    const dto = { email: 'a@b.c', password: 'pw123456', firstName: 'A', lastName: 'B' } as any;

    it('rejects duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes password, merges guest cart and returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const tokens = await service.register(dto, 'UA', '1.2.3.4', 'sess');

      expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBe('hashed:pw123456');
      expect(cart.mergeGuestCartToUser).toHaveBeenCalledWith({ userId: 1, sessionId: 'sess' });
      expect(tokens.accessToken).toBe('access.jwt');
      expect(typeof tokens.refreshToken).toBe('string');
      const session = prisma.refreshSession.create.mock.calls[0][0].data;
      expect(session).toMatchObject({ userId: 1, userAgent: 'UA', ip: '1.2.3.4' });
      expect(session.tokenHash).toBe(`hashed:${tokens.refreshToken}`);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    });
  });

  describe('validateLocalUser', () => {
    it('rejects unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.validateLocalUser('x', 'y')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects user without password (OAuth-only)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: null });
      await expect(service.validateLocalUser('a@b.c', 'y')).rejects.toThrow('Invalid credentials');
    });

    it('rejects deactivated user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      await expect(service.validateLocalUser('a@b.c', 'y')).rejects.toThrow('deactivated');
    });

    it('rejects wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      compare.mockResolvedValue(false);
      await expect(service.validateLocalUser('a@b.c', 'bad')).rejects.toThrow('Invalid credentials');
    });

    it('returns user on correct password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      compare.mockResolvedValue(true);
      await expect(service.validateLocalUser('a@b.c', 'ok')).resolves.toEqual({ id: 1, email: 'a@b.c', role: 'CUSTOMER' });
    });
  });

  it('login merges cart and issues tokens', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue(user);
    const tokens = await service.login(1, undefined, undefined, 'sess');
    expect(cart.mergeGuestCartToUser).toHaveBeenCalledWith({ userId: 1, sessionId: 'sess' });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 1, email: 'a@b.c', role: 'CUSTOMER' },
      expect.objectContaining({ secret: 'secret', expiresIn: '15m' }),
    );
    expect(tokens).toEqual({ accessToken: 'access.jwt', refreshToken: expect.any(String) });
  });

  describe('refresh', () => {
    const session = (over: any = {}) => ({
      id: 10,
      tokenHash: 'TH',
      expiresAt: new Date(Date.now() + 60_000),
      user,
      ...over,
    });

    it('rejects when no session matches', async () => {
      prisma.refreshSession.findMany.mockResolvedValue([session()]);
      compare.mockResolvedValue(false);
      await expect(service.refresh('bad')).rejects.toThrow('Invalid refresh token');
      expect(prisma.refreshSession.update).not.toHaveBeenCalled();
    });

    it('ignores expired sessions', async () => {
      prisma.refreshSession.findMany.mockResolvedValue([session({ expiresAt: new Date(Date.now() - 1) })]);
      compare.mockResolvedValue(true);
      await expect(service.refresh('tok')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(compare).not.toHaveBeenCalled();
    });

    it('rejects deactivated user', async () => {
      prisma.refreshSession.findMany.mockResolvedValue([session({ user: { ...user, isActive: false } })]);
      compare.mockResolvedValue(true);
      await expect(service.refresh('tok')).rejects.toThrow('deactivated');
    });

    it('rotates: revokes matched session and creates a new one', async () => {
      compare.mockImplementation(async (_t: string, h: string) => h === 'TH2');
      prisma.refreshSession.findMany.mockResolvedValue([session({ id: 9 }), session({ id: 10, tokenHash: 'TH2' })]);

      const tokens = await service.refresh('tok');

      expect(prisma.refreshSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { revokedAt: null } }));
      expect(prisma.refreshSession.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { revokedAt: expect.any(Date) } });
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
      expect(tokens.refreshToken).not.toBe('tok');
    });
  });
});
