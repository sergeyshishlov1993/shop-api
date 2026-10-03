import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { hashToken } from './token-hash';
import { randomUUID } from 'crypto';
import { CacheService } from '../cache/cache.service';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { GoogleProfile } from './types/google-profile.type';
import { Tokens } from './types/tokens.type';

// Скільки старий refresh-токен лишається дійсним після ротації
const REFRESH_GRACE_PERIOD_MS = 30_000;
// Блокировка входа в аккаунт после N неудачных попыток (поверх лимита по IP)
const MAX_LOGIN_FAILS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;

export type LoginMeta = { ip?: string; userAgent?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly cartService: CartService,
    private readonly cacheService: CacheService,
  ) {}

  // Одна строка на вход — для отладки «кто и когда зашёл». Пароли/токены не пишем.
  private logLogin(event: string, who: string, meta: LoginMeta = {}): void {
    const clean = (v?: string) => (v ?? '-').replace(/[\r\n]+/g, ' ').slice(0, 200);
    const line = `${event} ${clean(who)} ip=${clean(meta.ip)} ua="${clean(meta.userAgent)}"`;
    if (event.includes('fail')) this.logger.warn(line);
    else this.logger.log(line);
  }

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ip?: string,
    sessionId?: string | null,
  ): Promise<Tokens> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    await this.cartService.mergeGuestCartToUser({
      userId: user.id,
      sessionId,
    });

    this.logLogin('register ok', `user=${user.id} ${user.email}`, { ip, userAgent });
    return this.generateTokensAndCreateSession(
      user.id,
      user.email,
      user.role,
      userAgent,
      ip,
    );
  }

  async validateLocalUser(
    email: string,
    password: string,
    meta: LoginMeta = {},
  ): Promise<{ id: number; email: string; role: string }> {
    const failKey = `login-fail:${email.toLowerCase()}`;
    if (((await this.cacheService.get<number>(failKey)) ?? 0) >= MAX_LOGIN_FAILS) {
      this.logLogin('login fail(locked)', email, meta);
      throw new HttpException('Too many failed login attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      await this.cacheService.incr(failKey, LOGIN_LOCK_SECONDS);
      this.logLogin('login fail(no-user)', email, meta);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      this.logLogin('login fail(deactivated)', `user=${user.id} ${email}`, meta);
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      await this.cacheService.incr(failKey, LOGIN_LOCK_SECONDS);
      this.logLogin('login fail(password)', `user=${user.id} ${email}`, meta);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.cacheService.del(failKey);
    this.logLogin('login ok', `user=${user.id} ${email}`, meta);
    return { id: user.id, email: user.email, role: user.role };
  }

  async login(
    userId: number,
    userAgent?: string,
    ip?: string,
    sessionId?: string | null,
  ): Promise<Tokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.cartService.mergeGuestCartToUser({
      userId: user.id,
      sessionId,
    });

    return this.generateTokensAndCreateSession(
      user.id,
      user.email,
      user.role,
      userAgent,
      ip,
    );
  }

  async googleAuth(
    profile: GoogleProfile,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const providerAccount = await this.prisma.userProviderAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'GOOGLE',
          providerUserId: profile.googleId,
        },
      },
      include: { user: true },
    });

    if (providerAccount) {
      if (!providerAccount.user.isActive) {
        this.logLogin('google fail(deactivated)', `user=${providerAccount.user.id} ${providerAccount.user.email}`, { ip, userAgent });
        throw new UnauthorizedException('Account is deactivated');
      }

      this.logLogin('google ok', `user=${providerAccount.user.id} ${providerAccount.user.email}`, { ip, userAgent });
      return this.generateTokensAndCreateSession(
        providerAccount.user.id,
        providerAccount.user.email,
        providerAccount.user.role,
        userAgent,
        ip,
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingUser) {
      if (!existingUser.isActive) {
        this.logLogin('google fail(deactivated)', `user=${existingUser.id} ${existingUser.email}`, { ip, userAgent });
        throw new UnauthorizedException('Account is deactivated');
      }

      await this.prisma.userProviderAccount.create({
        data: {
          userId: existingUser.id,
          provider: 'GOOGLE',
          providerUserId: profile.googleId,
        },
      });

      this.logLogin('google ok', `user=${existingUser.id} ${existingUser.email}`, { ip, userAgent });
      return this.generateTokensAndCreateSession(
        existingUser.id,
        existingUser.email,
        existingUser.role,
        userAgent,
        ip,
      );
    }

    const newUser = await this.prisma.user.create({
      data: {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        providerAccounts: {
          create: {
            provider: 'GOOGLE',
            providerUserId: profile.googleId,
          },
        },
      },
    });

    this.logLogin('google ok', `user=${newUser.id} ${newUser.email}`, { ip, userAgent });
    return this.generateTokensAndCreateSession(
      newUser.id,
      newUser.email,
      newUser.role,
      userAgent,
      ip,
    );
  }

  async refresh(
    refreshToken: string,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const matchedSession = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    const now = new Date();
    // Льготний період: токен, щойно замінений ротацією (друга вкладка / скасований запит), ще приймаємо.
    // Відкликаний logout-ом чи зміною пароля (rotatedAt = null) — ні.
    const inGracePeriod = matchedSession?.rotatedAt
      && now.getTime() - matchedSession.rotatedAt.getTime() < REFRESH_GRACE_PERIOD_MS;

    if (!matchedSession || (matchedSession.revokedAt && !inGracePeriod) || matchedSession.expiresAt < now) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!matchedSession.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!matchedSession.revokedAt) {
      await this.prisma.refreshSession.update({
        where: { id: matchedSession.id },
        data: { revokedAt: now, rotatedAt: now },
      });
    }

    return this.generateTokensAndCreateSession(
      matchedSession.user.id,
      matchedSession.user.email,
      matchedSession.user.role,
      userAgent,
      ip,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return;
    }

    const recentTokensCount = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    if (recentTokensCount >= 3) {
      return;
    }

    const rawToken = randomUUID();

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const matchedToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(rawToken),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!matchedToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: matchedToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: matchedToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: matchedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async generateTokensAndCreateSession(
    userId: number,
    email: string,
    role: string,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const signOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    };

    const accessToken = this.jwtService.sign({ sub: userId, email, role }, signOptions);

    const refreshToken = randomUUID();

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        userAgent: userAgent ?? null,
        ip: ip ?? null,
        expiresAt: this.calculateExpiry(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') ?? '30d',
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  private calculateExpiry(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + parseInt(match[1], 10) * multipliers[match[2]]);
  }
}
