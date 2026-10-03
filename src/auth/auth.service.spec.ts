import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { hashToken } from './token-hash';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const hash = bcrypt.hash as unknown as jest.Mock;
const compare = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let cart: any;
  let service: AuthService;
  let email: any;
  let cache: any;

  const user = { id: 1, email: 'a@b.c', role: 'CUSTOMER', isActive: true, passwordHash: 'H' };

  beforeEach(() => {
    hash.mockReset().mockImplementation(async (v: string) => `hashed:${v}`);
    compare.mockReset();
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
      refreshSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      passwordResetToken: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('access.jwt') };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
      get: jest.fn((_k: string, d?: string) => d),
    };
    cart = { mergeGuestCartToUser: jest.fn() };
    email = { sendPasswordResetEmail: jest.fn() };
    cache = { get: jest.fn().mockResolvedValue(null), incr: jest.fn(), del: jest.fn() };
    service = new AuthService(prisma, jwt, config as any, email, cart, cache);
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
      expect(session.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(hash).toHaveBeenCalledTimes(1);
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

    it('returns user on correct password and resets fail counter', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      compare.mockResolvedValue(true);
      await expect(service.validateLocalUser('a@b.c', 'ok')).resolves.toEqual({ id: 1, email: 'a@b.c', role: 'CUSTOMER' });
      expect(cache.del).toHaveBeenCalledWith('login-fail:a@b.c');
    });

    it('counts failed attempts per email', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      compare.mockResolvedValue(false);
      await expect(service.validateLocalUser('A@b.c', 'bad')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(cache.incr).toHaveBeenCalledWith('login-fail:a@b.c', 900);
    });

    it('locks account after 5 failures without checking password', async () => {
      cache.get.mockResolvedValue(5);
      await expect(service.validateLocalUser('a@b.c', 'ok')).rejects.toMatchObject({ status: 429 });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
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

  describe('hashToken', () => {
    it('is deterministic sha256 hex and differs from input', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
      expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
      expect(hashToken('abc')).not.toBe('abc');
      expect(hashToken('abc')).not.toBe(hashToken('abd'));
    });
  });

  describe('refresh', () => {
    const session = (over: any = {}) => ({
      id: 10,
      tokenHash: hashToken('tok'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
      ...over,
    });

    it('looks up session by hashed token', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session());
      await service.refresh('tok');
      expect(prisma.refreshSession.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('tok') },
        include: { user: true },
      });
      expect(compare).not.toHaveBeenCalled();
    });

    it('rejects when no session matches', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(null);
      await expect(service.refresh('bad')).rejects.toThrow('Invalid refresh token');
      expect(prisma.refreshSession.update).not.toHaveBeenCalled();
    });

    it('rejects revoked session', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session({ revokedAt: new Date() }));
      await expect(service.refresh('tok')).rejects.toThrow('Invalid refresh token');
      expect(prisma.refreshSession.update).not.toHaveBeenCalled();
    });

    it('rejects expired session', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session({ expiresAt: new Date(Date.now() - 1) }));
      await expect(service.refresh('tok')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshSession.update).not.toHaveBeenCalled();
    });

    it('rejects deactivated user', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session({ user: { ...user, isActive: false } }));
      await expect(service.refresh('tok')).rejects.toThrow('deactivated');
    });

    it('rotates: revokes matched session and creates a new one', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session());
      const tokens = await service.refresh('tok');
      expect(prisma.refreshSession.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { revokedAt: expect.any(Date), rotatedAt: expect.any(Date) },
      });
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
      expect(tokens.refreshToken).not.toBe('tok');
    });

    it('grace period: accepts token rotated moments ago (second tab) without re-revoking', async () => {
      const at = new Date(Date.now() - 5_000);
      prisma.refreshSession.findUnique.mockResolvedValue(session({ revokedAt: at, rotatedAt: at }));
      const tokens = await service.refresh('tok');
      expect(tokens.accessToken).toBeDefined();
      expect(prisma.refreshSession.update).not.toHaveBeenCalled();
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
    });

    it('grace period over: rejects token rotated more than 30s ago', async () => {
      const at = new Date(Date.now() - 31_000);
      prisma.refreshSession.findUnique.mockResolvedValue(session({ revokedAt: at, rotatedAt: at }));
      await expect(service.refresh('tok')).rejects.toThrow('Invalid refresh token');
      expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    });

    it('no grace for logout/password-change revocation (rotatedAt null)', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(session({ revokedAt: new Date(), rotatedAt: null }));
      await expect(service.refresh('tok')).rejects.toThrow('Invalid refresh token');
    });

    it('grace period does not bypass expiry', async () => {
      const at = new Date();
      prisma.refreshSession.findUnique.mockResolvedValue(session({ revokedAt: at, rotatedAt: at, expiresAt: new Date(Date.now() - 1) }));
      await expect(service.refresh('tok')).rejects.toThrow('Invalid refresh token');
    });
  });

  it('logout revokes by hashed token', async () => {
    await service.logout('tok');
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('tok'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('forgotPassword stores sha256 of the emailed token', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.passwordResetToken.count.mockResolvedValue(0);
    await service.forgotPassword('a@b.c');
    const sent = email.sendPasswordResetEmail.mock.calls[0][1];
    const stored = prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.c', sent);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).toBe(hashToken(sent));
    expect(stored).not.toBe(sent);
  });

  describe('resetPassword', () => {
    it('queries by hashed token and rejects when not found', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('raw', 'newpass1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passwordResetToken.findFirst).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('raw'), usedAt: null, expiresAt: { gt: expect.any(Date) } },
      });
      expect(hash).not.toHaveBeenCalled();
    });
  });
});
